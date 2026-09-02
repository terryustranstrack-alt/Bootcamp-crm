import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Proksi media WhatsApp. File-nya disimpan di bucket privat, jadi tidak bisa
// diakses langsung. Route ini: (1) pastikan user yang login memang berhak
// lihat pesan itu (lewat RLS di `messages`), (2) buatkan signed URL sementara
// ke file-nya, (3) redirect ke situ. Dipakai oleh <img>/<audio>/<a> di inbox.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: message } = await supabase
    .from("messages")
    .select("media_path, media_status")
    .eq("id", id)
    .maybeSingle();

  if (!message) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!message.media_path || message.media_status !== "stored") {
    return new NextResponse("Media not available", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("whatsapp-media")
    .createSignedUrl(message.media_path, 60);

  if (error || !signed?.signedUrl) {
    return new NextResponse("Failed to load media", { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
