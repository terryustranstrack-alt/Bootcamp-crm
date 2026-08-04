# Deploy ke Vercel

Ikuti langkah ini secara manual di dashboard Vercel (vercel.com).

1. Login ke vercel.com (bisa pakai akun GitHub).
2. Klik **Add New... > Project**.
3. Pilih **Import Git Repository**, cari repo `terryustranstrack-alt/bootcamp-crm`,
   klik **Import**.
4. Vercel otomatis mendeteksi framework **Next.js** — biarkan default
   (Build Command: `next build`, Output: default, Root Directory: `./`).
5. Sebelum klik Deploy, buka bagian **Environment Variables** dan tambahkan
   dua variabel ini (nilainya sama seperti isi `.env.local` di komputer kamu):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Jangan masukkan key lain (service role key, DB password, dsb) — aplikasi
   ini hanya butuh dua variabel di atas, keduanya memang didesain untuk
   dipakai di sisi browser.
6. Klik **Deploy**. Tunggu sampai build selesai.
7. Setelah selesai, Vercel memberi satu link (`https://<nama-project>.vercel.app`).
   Ini link yang dipakai untuk mengakses CRM dari HP maupun komputer.

## Update selanjutnya

Kalau ada perubahan kode dan di-push ke branch yang terhubung ke Vercel,
Vercel otomatis build & deploy ulang — tidak perlu ulangi langkah di atas.

## Kalau env variable perlu diubah nanti

Project > Settings > Environment Variables > edit nilainya > lalu buka tab
**Deployments**, pilih deployment terakhir, klik **Redeploy** (env variable
baru tidak berlaku ke deployment yang sudah jadi tanpa redeploy).
