import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { MessageType } from "@/lib/types";

const GRAPH_API_VERSION = "v21.0";

export class WhatsappApiError extends Error {}

/**
 * Kirim pesan teks lewat WhatsApp Cloud API resmi. `to` harus dalam format
 * digit-saja + kode negara (sama seperti wa_id dari webhook), lihat
 * src/lib/phone.ts.
 */
export async function sendTextMessage(
  to: string,
  body: string,
): Promise<{ waMessageId: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new WhatsappApiError("WhatsApp Cloud API belum dikonfigurasi.");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message ?? `Gagal kirim pesan (HTTP ${res.status}).`;
    throw new WhatsappApiError(message);
  }

  const waMessageId = data?.messages?.[0]?.id;
  if (!waMessageId) {
    throw new WhatsappApiError("Respons WhatsApp API tidak berisi message id.");
  }
  return { waMessageId };
}

function requireWhatsappCreds(): { phoneNumberId: string; accessToken: string } {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new WhatsappApiError("WhatsApp Cloud API belum dikonfigurasi.");
  }
  return { phoneNumberId, accessToken };
}

/** Jenis media yang bisa dikirim keluar lewat Cloud API. */
export type OutboundMediaType = "image" | "document" | "audio" | "video";

/**
 * Ambil URL unduhan sementara untuk sebuah media WhatsApp (dari media id yang
 * datang di webhook). URL-nya berlaku singkat (~5 menit) dan tetap butuh
 * bearer token saat diunduh — lihat downloadMedia().
 */
export async function getMediaUrl(
  mediaId: string,
): Promise<{ url: string; mimeType: string; fileSize: number }> {
  const { accessToken } = requireWhatsappCreds();
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  if (!res.ok || !data?.url) {
    const message =
      data?.error?.message ?? `Gagal ambil URL media (HTTP ${res.status}).`;
    throw new WhatsappApiError(message);
  }
  return {
    url: data.url,
    mimeType: data.mime_type ?? "application/octet-stream",
    fileSize: Number(data.file_size ?? 0),
  };
}

/** Unduh isi biner sebuah media dari URL yang dikasih getMediaUrl(). */
export async function downloadMedia(
  url: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const { accessToken } = requireWhatsappCreds();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new WhatsappApiError(`Gagal unduh media (HTTP ${res.status}).`);
  }
  const bytes = await res.arrayBuffer();
  return {
    bytes,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

/**
 * Kirim pesan media (gambar/dokumen/audio/video) lewat Cloud API dengan cara
 * "link" — Meta yang mengunduh file dari URL yang kita kasih (harus HTTPS &
 * bisa diakses publik untuk sesaat, mis. signed URL dari Supabase Storage).
 */
export async function sendMediaMessage(
  to: string,
  opts: {
    type: OutboundMediaType;
    link: string;
    filename?: string;
    caption?: string;
  },
): Promise<{ waMessageId: string }> {
  const { phoneNumberId, accessToken } = requireWhatsappCreds();

  const mediaObject: Record<string, string> = { link: opts.link };
  if (opts.filename && opts.type === "document") {
    mediaObject.filename = opts.filename;
  }
  if (opts.caption && (opts.type === "image" || opts.type === "video")) {
    mediaObject.caption = opts.caption;
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: opts.type,
        [opts.type]: mediaObject,
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    const message =
      data?.error?.message ?? `Gagal kirim media (HTTP ${res.status}).`;
    throw new WhatsappApiError(message);
  }
  const waMessageId = data?.messages?.[0]?.id;
  if (!waMessageId) {
    throw new WhatsappApiError("Respons WhatsApp API tidak berisi message id.");
  }
  return { waMessageId };
}

/**
 * Kirim tanda "sudah dibaca" (centang biru) ke WhatsApp untuk sebuah pesan
 * masuk. Best-effort — kalau gagal, tidak apa-apa (tidak dilempar ke UI).
 */
export async function markMessageRead(waMessageId: string): Promise<void> {
  const { phoneNumberId, accessToken } = requireWhatsappCreds();
  await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: waMessageId,
      }),
    },
  );
}

/** Verifikasi header X-Hub-Signature-256 dari webhook Meta. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// Bentuk payload webhook WhatsApp Cloud API (subset yang dipakai app ini).
export type WhatsappWebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string };
          document?: { id: string; mime_type: string; filename?: string };
          audio?: { id: string; mime_type: string };
          video?: { id: string; mime_type: string };
          sticker?: { id: string; mime_type: string };
        }>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          errors?: Array<{ message?: string }>;
        }>;
      };
    }>;
  }>;
};

// Jenis pesan media yang bisa dikenali (metadatanya disimpan) walau tidak
// ada viewer media di UI — lihat komentar MessageType di lib/types.ts.
const KNOWN_MEDIA_TYPES: MessageType[] = [
  "image",
  "document",
  "audio",
  "video",
  "sticker",
];

// Ubah tipe pesan mentah dari WhatsApp Cloud API jadi MessageType internal
// aplikasi. Tipe yang tidak dikenali (mis. "contacts", "interactive")
// dianggap "unsupported" supaya tidak bikin error saat disimpan/ditampilkan.
export function toMessageType(waType: string): MessageType {
  if (waType === "text") return "text";
  if (waType === "location") return "location";
  if (KNOWN_MEDIA_TYPES.includes(waType as MessageType)) {
    return waType as MessageType;
  }
  return "unsupported";
}
