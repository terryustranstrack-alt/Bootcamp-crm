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
          document?: { id: string; mime_type: string };
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
