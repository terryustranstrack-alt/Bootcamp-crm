/**
 * Menyamakan format nomor telepon Indonesia supaya bisa dicocokkan antara
 * leads.kontak (bebas format, mis. "0812-3456-789") dan wa_id dari
 * WhatsApp Cloud API (digit saja, kode negara, mis. "6281234567890").
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return digits;
}
