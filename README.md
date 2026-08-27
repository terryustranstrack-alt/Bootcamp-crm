This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Login

Aplikasi ini invite-only, tidak ada halaman signup. Untuk membuat akun:

1. Buka Supabase Dashboard project ini > **Authentication** > **Users**.
2. Klik **Add user** > **Create new user**, isi email & password.
3. Bagikan kredensial itu ke user yang bersangkutan, mereka login di `/login`.

User dengan `profiles.is_admin = true` (default: `admin@transtrack.id`, lihat
`supabase/migrations/0006_sales_admin.sql`) bisa langsung menambah/menghapus
akun Sales dari menu **Data Sales** di aplikasi tanpa perlu ke Supabase
Dashboard — butuh `SUPABASE_SERVICE_ROLE_KEY` di `.env.local` (lihat
`.env.local.example`).

## Setup WhatsApp

Fitur Inbox pakai WhatsApp Business **Cloud API resmi** dari Meta (bukan
wrapper pihak ketiga). Asumsi: kamu sudah punya WhatsApp Business Account
(WABA) terverifikasi. Langkah untuk sambungkan Cloud API-nya:

1. Buat app di [Meta for Developers](https://developers.facebook.com/apps),
   tambah produk **WhatsApp**, lalu hubungkan ke WABA kamu.
2. Di WhatsApp > API Setup, catat **Phone number ID** →
   `WHATSAPP_PHONE_NUMBER_ID`.
3. Generate permanent access token lewat System User (Business Settings >
   Users > System Users, beri permission `whatsapp_business_messaging`) →
   `WHATSAPP_ACCESS_TOKEN`. Token sementara dari halaman API Setup cuma
   berlaku 24 jam, jangan dipakai untuk production.
4. App Dashboard > Settings > Basic, catat **App Secret** →
   `WHATSAPP_APP_SECRET` (dipakai verifikasi webhook).
5. Isi `WHATSAPP_WEBHOOK_VERIFY_TOKEN` bebas (string apa saja, kamu yang
   tentukan), lalu di WhatsApp > Configuration, set Callback URL ke
   `https://<domain-app-kamu>/api/whatsapp/webhook` dan Verify Token ke
   nilai yang sama. Subscribe ke field `messages`.
6. Pesan WhatsApp yang masuk otomatis nyambung ke lead lewat pencocokan
   nomor telepon (`leads.kontak`); kalau belum ada lead yang cocok,
   percakapan masuk ke pool "belum diklaim" di halaman **Inbox** dan bisa
   di-link manual ke lead atau dibuatkan lead baru.

Catatan: di luar jendela 24 jam sejak pesan terakhir dari kontak, Meta
melarang balasan teks bebas (harus pakai message template berbayar/
approved) — versi ini belum mendukung kirim template, jadi balasan lewat
Inbox cuma jalan selama jendela 24 jam itu masih terbuka.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
