@AGENTS.md

# Aturan Proyek

Aturan berikut wajib diikuti setiap kali menulis atau mengubah kode di proyek ini.

## 1. Teks antarmuka dalam Bahasa Inggris

Semua teks yang tampil ke pengguna (label, tombol, judul, placeholder,
pesan error/sukses, dll.) ditulis dalam **Bahasa Inggris**.

> Catatan: sebagian besar UI yang sudah ada saat ini masih Bahasa
> Indonesia (dibuat sebelum aturan ini ada). Aturan ini berlaku untuk teks
> UI baru atau yang sedang diubah — jangan ikut menerjemahkan teks UI lama
> yang tidak sedang disentuh, kecuali memang diminta.

## 2. Komentar penjelas bahasa sederhana

Beri komentar singkat di setiap bagian kode yang penting — logika bisnis,
keputusan yang tidak jelas alasannya kalau cuma dibaca sekilas, atau alasan
di balik sebuah pendekatan. Tulis dengan bahasa yang sederhana dan mudah
dipahami, hindari istilah teknis yang tidak perlu. Ikuti bahasa yang sudah
dipakai di komentar sekitar kode tersebut (di proyek ini umumnya Bahasa
Indonesia).

## 3. Satu fungsi, satu tugas

Setiap fungsi hanya mengerjakan satu tanggung jawab yang jelas. Kalau
sebuah fungsi mulai melakukan beberapa hal sekaligus (mis. validasi +
simpan ke database + kirim notifikasi), pecah jadi beberapa fungsi kecil
yang masing-masing punya nama yang menjelaskan tugasnya sendiri.

## 4. Jangan menambah fitur atau library yang tidak diminta

Kerjakan persis apa yang diminta. Jangan menambahkan fitur, opsi
tambahan, atau dependency/library baru di luar permintaan — sekalipun
terlihat berguna. Kalau ada kebutuhan tambahan yang dirasa penting,
sampaikan dulu sebagai saran ke pengguna, jangan langsung diimplementasikan.

## 5. Selalu jelaskan dalam bahasa non-teknis

Saat menjelaskan perubahan atau hasil kerja ke pengguna, gunakan bahasa
awam/non-teknis — hindari istilah pemrograman tanpa penjelasan, supaya
tetap bisa dipahami oleh yang bukan programmer.
