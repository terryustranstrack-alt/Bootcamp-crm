// Semua tipe data (bentuk baris tabel Supabase) dipakai bersama di seluruh
// aplikasi. Nama field sengaja mengikuti nama kolom database apa adanya
// (banyak dalam Bahasa Indonesia) supaya gampang dicocokkan dengan query
// Supabase di komponen/halaman.

// Tahapan progres sebuah lead, dari baru masuk sampai closing/hilang.
// Urutan array ini dipakai juga untuk urutan kolom di LeadBoard.
export const LEAD_STATUSES = [
  "Baru",
  "Dihubungi",
  "Tertarik",
  "Nego",
  "Closing",
  "Hilang",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Nilai status yang tersimpan di database sengaja dibiarkan seperti ini
// ("Baru", "Dihubungi", dst.) — mengubahnya butuh migrasi database dan akan
// mengubah data lead yang sudah ada. Yang diterjemahkan ke Bahasa Inggris
// cuma TAMPILANNYA, lewat leadStatusLabel() di bawah ini. Selalu pakai
// fungsi ini (bukan status mentah) untuk teks yang dilihat pengguna.
const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  Baru: "New",
  Dihubungi: "Contacted",
  Tertarik: "Interested",
  Nego: "Negotiating",
  Closing: "Won",
  Hilang: "Lost",
};

export function leadStatusLabel(status: LeadStatus): string {
  return LEAD_STATUS_LABELS[status];
}

// Kebalikan dari leadStatusLabel(): dari label Bahasa Inggris ("New",
// "Contacted", dst., tidak peduli huruf besar/kecil) balik ke nilai
// LeadStatus internal. Juga menerima nilai mentah lama ("Baru", dst.)
// supaya file CSV yang diekspor sebelum UI diterjemahkan tetap bisa
// diimpor. Return null kalau teksnya tidak dikenali sama sekali.
export function leadStatusFromLabel(label: string): LeadStatus | null {
  const trimmed = label.trim();
  const byLabel = (Object.entries(LEAD_STATUS_LABELS) as [LeadStatus, string][])
    .find(([, englishLabel]) => englishLabel.toLowerCase() === trimmed.toLowerCase());
  if (byLabel) return byLabel[0];
  if ((LEAD_STATUSES as readonly string[]).includes(trimmed)) {
    return trimmed as LeadStatus;
  }
  return null;
}

// Satu baris di tabel `leads` — data inti calon pelanggan (prospek).
export type Lead = {
  id: string;
  nama: string;
  kontak: string; // nomor WA/telepon, format bebas
  sumber: string | null; // dari mana lead ini didapat (Instagram Ads, Referral, dll.)
  status: LeadStatus;
  tanggal_masuk: string;
  tanggal_update: string;
  catatan: string; // field "Notes / requirements" — catatan bebas tentang kebutuhan lead
  produk: string | null;
  estimasi_nilai: number | null; // perkiraan nilai transaksi (rupiah)
  kota: string | null; // kota/wilayah calon pelanggan
  perusahaan: string | null; // nama perusahaan/organisasi (untuk lead B2B)
  jabatan: string | null; // jabatan/peran orang ini di perusahaannya
  assigned_to: string | null; // id sales yang menangani (profiles.id)
  created_by: string | null;
};

export type LeadActivityType = "status_change" | "note";

// Satu baris riwayat aktivitas pada sebuah lead: perubahan status atau
// catatan bebas yang ditambahkan sales/admin.
export type LeadActivity = {
  id: string;
  lead_id: string;
  type: LeadActivityType;
  content: string | null; // isi catatan, hanya diisi kalau type === "note"
  old_status: LeadStatus | null;
  new_status: LeadStatus | null;
  created_at: string;
  created_by: string | null;
};

// Satu baris di tabel `profiles` — akun login (sales/admin), dibuat
// otomatis lewat trigger saat user Supabase Auth baru dibuat.
export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
};

// Kanal chat yang didukung. Baru WhatsApp untuk sekarang, tapi kolom
// `channel` di database berupa check constraint sehingga gampang ditambah
// kanal lain nanti (mis. Instagram DM) tanpa ubah struktur tabel.
export type ConversationChannel = "whatsapp";

// Status penanganan percakapan (antrean kerja inbox). 'open' = perlu
// ditindaklanjuti, 'pending' = menunggu sesuatu, 'resolved' = selesai.
export type ConversationStatus = "open" | "pending" | "resolved";

// Satu percakapan (thread chat) dengan satu kontak eksternal. Bisa
// terhubung ke sebuah lead atau belum (kontak baru yang belum jadi lead).
export type Conversation = {
  id: string;
  channel: ConversationChannel;
  external_contact_id: string; // wa_id dari WhatsApp Cloud API
  display_name: string | null; // nama profil WhatsApp kontak, kalau ada
  lead_id: string | null;
  assigned_to: string | null; // sales yang "mengklaim" percakapan ini
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  status: ConversationStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};

export type MessageDirection = "inbound" | "outbound";

export type MessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "sticker"
  | "location"
  | "unsupported";

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

// Status unduhan file media ke Supabase Storage: 'none' = bukan pesan media,
// 'pending' = sedang/antre diunduh, 'stored' = sudah tersimpan, 'failed' = gagal.
export type MediaStatus = "none" | "pending" | "stored" | "failed";

// Satu pesan di dalam sebuah percakapan.
export type Message = {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  wa_message_id: string | null; // id pesan dari WhatsApp, dipakai cocokkan status delivery/read
  type: MessageType;
  text_body: string | null;
  media_id: string | null; // id media di sisi Meta
  media_mime_type: string | null;
  media_path: string | null; // path file di bucket "whatsapp-media" kalau sudah diunduh
  media_filename: string | null; // nama file asli (untuk dokumen)
  media_status: MediaStatus;
  status: MessageStatus;
  error_message: string | null;
  sent_by: string | null; // user yang kirim, hanya diisi untuk pesan outbound
  wa_timestamp: string | null; // waktu asli dari WhatsApp (dipakai untuk urutan)
  created_at: string;
};
