INDONESIA UTILITY TOOLS — V1.4 SMART CONVERTER + OCR

PERBAIKAN UTAMA
1. PDF -> Excel
   - Smart table reconstruction berbasis posisi teks, bukan template PDF tertentu.
   - Deteksi header + batas kolom otomatis.
   - Refine posisi kolom dari baris data berulang.
   - OCR fallback untuk PDF scan/foto.
   - Sheet Converted Table + Raw Text + Diagnostics.
   - OCR dapat dipaksa lewat checkbox, dan otomatis dipakai jika text layer tidak cukup.

2. PDF -> Word
   - Menggunakan engine yang sama.
   - Tabel digital dibuat sebagai tabel Word editable.
   - OCR fallback untuk scan/foto.
   - Jika tabel tidak terdeteksi, teks per halaman tetap dibuat sebagai paragraf editable.

3. Excel -> PDF
   - Semua sheet diproses.
   - Header berulang pada halaman.
   - Wrapping teks panjang.
   - Kolom lebar diskalakan agar tidak terpotong.
   - Horizontal page break untuk workbook lebar.

CATATAN OCR
- OCR berjalan di browser menggunakan Tesseract.js.
- Untuk hasil terbaik gunakan scan yang tajam, lurus, dan resolusi memadai.
- OCR bahasa default: English (angka, kode, tabel, dan istilah Indonesia umumnya tetap terbaca).
- OCR memerlukan internet saat pertama kali engine/language data dimuat dari CDN.

PENGUJIAN YANG DILAKUKAN
- Struktur paket dicek.
- Semua halaman converter diperiksa untuk dependency dan event handler.
- PDF contoh 3 halaman tersedia sebagai bahan uji manual.
- Workbook contoh tersedia sebagai bahan uji manual.

DEPLOY
Upload isi folder ZIP ke repository GitHub, pertahankan struktur:
assets/
tools/
index.html
about.html
contact.html
disclaimer.html
privacy.html
README.txt
