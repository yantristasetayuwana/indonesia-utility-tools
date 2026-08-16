INDONESIA UTILITY TOOLS — V1.3 SMART CONVERTER
================================================

Perbaikan utama:
- Smart Document Conversion Engine v1.3 ditambahkan di assets/converter-engine.js.
- PDF -> Excel tidak lagi memakai pemisahan kolom berdasarkan jarak teks semata.
- Engine mendeteksi header, posisi kolom, dan meneruskan schema tabel ke halaman berikutnya.
- PDF -> Word menggunakan hasil deteksi tabel untuk membuat tabel DOCX editable.
- Excel -> PDF menggunakan lebar kolom adaptif, wrapping, repeated header, dan horizontal page break.
- Word -> PDF menggunakan rendering HTML dari DOCX agar format dasar dan tabel lebih terjaga.

HASIL TEST ENGINE
=================
1. Benchmark PDF Weighbridge: "Detail Received 16 Agustus 2026(1).pdf"
   - 3 halaman
   - 112 baris data terdeteksi
   - 10 kolom terdeteksi
   - No. 1 sampai 112 lengkap, tidak ada duplikat
   - Gross - Tarra = Netto: 0 error
   - Header terdeteksi sebagai:
     No | No.Ticket | No.Truck | In | Out | Gross(Ton) | Tarra(Ton) | Netto(Ton) | Sub Leader | Leader

2. PDF tabel lain: "excel-ke-pdf.pdf"
   - 12 halaman
   - 252 baris data terdeteksi pada tabel detail
   - 9 kolom terdeteksi
   - Header compound seperti NO. PO, NO. GRN, NO. TRANSFER, PART NUMBER,
     dan QTY TERIMA berhasil digabung menjadi satu kolom.

3. Validasi kode
   - Inline JavaScript syntax check: PASS
   - Smart engine syntax check: PASS

CATATAN TEST RUNTIME
====================
Runtime browser interaktif dengan CDN eksternal tidak dapat dijalankan penuh di
lingkungan pengujian ini karena kebijakan sandbox memblokir navigasi Chromium.
Karena itu hasil di atas memvalidasi mesin ekstraksi dan sintaks kode secara
langsung, tetapi bukan simulasi klik browser end-to-end.

CARA DEPLOY
===========
Upload folder berikut ke repository GitHub, jangan ubah struktur:
- assets/
- tools/

converter-engine.js harus berada di:
assets/converter-engine.js

Cloudflare Pages:
- Framework preset: None
- Build command: exit 0
- Build output directory: .
- Root directory: /
