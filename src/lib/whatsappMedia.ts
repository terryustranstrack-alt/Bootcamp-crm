import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadMedia, getMediaUrl } from "@/lib/whatsapp";

type AdminClient = ReturnType<typeof createAdminClient>;

// Ekstensi file berdasarkan mime type — buat nama file yang rapi di Storage.
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

function extForMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (EXT_BY_MIME[base]) return EXT_BY_MIME[base];
  const slash = base.indexOf("/");
  return slash >= 0 ? base.slice(slash + 1) : "bin";
}

/**
 * Unduh satu file media WhatsApp yang baru masuk dari webhook dan simpan ke
 * bucket privat "whatsapp-media", lalu tandai baris messages-nya 'stored'.
 * Kalau gagal di langkah manapun, baris ditandai 'failed' (tidak dilempar,
 * supaya webhook tetap balas 200 ke Meta).
 *
 * Dipanggil lewat after() di webhook route — jadi tidak menahan respons.
 */
export async function storeInboundMedia(
  admin: AdminClient,
  message: {
    waMessageId: string;
    mediaId: string;
    mimeType: string;
    filename?: string | null;
  },
): Promise<void> {
  try {
    const { url, mimeType: urlMime } = await getMediaUrl(message.mediaId);
    const { bytes, contentType } = await downloadMedia(url);
    const mime = message.mimeType || urlMime || contentType;
    const path = `inbound/${message.waMessageId}.${extForMime(mime)}`;

    const { error: uploadError } = await admin.storage
      .from("whatsapp-media")
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (uploadError) throw uploadError;

    await admin
      .from("messages")
      .update({
        media_path: path,
        media_filename: message.filename ?? null,
        media_status: "stored",
      })
      .eq("wa_message_id", message.waMessageId);
  } catch {
    await admin
      .from("messages")
      .update({ media_status: "failed" })
      .eq("wa_message_id", message.waMessageId);
  }
}
