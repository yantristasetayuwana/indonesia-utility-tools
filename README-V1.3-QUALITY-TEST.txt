INDONESIA UTILITY TOOLS — V1.3 QUALITY FIX
=============================================

Paket ini adalah perbaikan mesin konversi dan pemeriksaan tools dari V1.2.

PERBAIKAN UTAMA
1. PDF → Excel
   - Mesin repair tabel untuk laporan weighbridge.
   - Memperbaiki transaksi yang terpecah antar baris.
   - Menyatukan multi-page.
   - Menghasilkan kolom:
     No | Ticket No. | Truck | In | Out | Gross (Ton) | Tarra (Ton) |
     Netto (Ton) | Sub Leader | Leader | Validasi
   - Gross - Tarra dibandingkan dengan Netto.
   - Sheet Raw Text disediakan sebagai fallback.

2. PDF → Word
   - Laporan weighbridge dibuat sebagai tabel Word.
   - Judul/tanggal dipisahkan.
   - Multi-page digabung.
   - PDF umum menggunakan fallback teks.

3. Excel → PDF
   - Semua sheet diproses.
   - Header diulang.
   - Wrapping.
   - Horizontal page break untuk sheet lebar.
   - Baris kosong akhir dibuang.

4. Word → PDF
   - DOCX dibaca menjadi HTML.
   - Tabel tidak lagi diratakan menjadi teks.
   - HTML dirender ke halaman A4 sebelum dibuat PDF.

5. JPG → PDF
   - Multi-file.
   - Urutan file dipertahankan.
   - Orientasi otomatis.
   - Rasio gambar tidak didistorsi.
   - PNG transparan diberi latar putih.

HASIL BENCHMARK
----------------
Benchmark PDF:
Detail Received 16 Agustus 2026.pdf

Hasil pembacaan benchmark:
- 3 halaman
- 112 transaksi terdeteksi
- Transaksi pertama: TLP260011529
- Transaksi terakhir: TO26006590
- Jumlah Gross terhitung: 2,624.990 Ton
- Jumlah Tarra terhitung: 738.300 Ton
- Jumlah Netto terhitung: 1,886.690 Ton
- Total Netto sama dengan total yang tercetak pada PDF: 1,886.690 Ton
- Setiap transaksi memiliki 2 waktu dan 3 angka tonase pada benchmark.

Benchmark Excel:
Detail_Received_10_Agustus_2026(2).xlsx

Target struktur hasil:
- Judul laporan di atas tabel
- Tanggal laporan
- Header 10 kolom
- Satu transaksi = satu baris
- Kolom angka tetap terpisah
- Total di bagian bawah

PEMERIKSAAN KODE
----------------
Semua 15 file HTML diperiksa dengan JavaScript syntax check (Node.js).
Tidak ditemukan syntax error.

CATATAN DEPLOYMENT
------------------
Paket ini menggunakan CDN untuk PDF.js, SheetJS, docx.js, Mammoth,
html2canvas, jsPDF, dan jsPDF-AutoTable. Cloudflare Pages tidak
memerlukan build command.

Build command:
exit 0

Build output directory:
.

Root directory:
kosong / root repository

UPLOAD
------
Upload isi ZIP ke repository GitHub yang sama, bukan folder ZIP-nya.
Setelah commit, tunggu Cloudflare Pages automatic deployment selesai.
