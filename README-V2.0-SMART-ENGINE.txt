INDONESIA UTILITY TOOLS V2.0 — SMART DOCUMENT ENGINE + BUTTON FIX

Perubahan utama:
1. Extraction: PDF text-layer parsing + optional OCR. OCR tidak lagi dipanggil otomatis ketika parser lemah.
2. Parsing: deteksi header, posisi kolom, baris data, dan struktur multi-halaman secara generik.
3. Validation: engine menghitung kualitas hasil sebelum export.
4. Structure: PDF→Excel menghasilkan Converted Table, Raw Text, dan Diagnostics.
5. Button reliability: seluruh tombol Export menggunakan state idle/busy/ready yang aman; bug recursive setReady diperbaiki pada PDF→Excel, PDF→Word, dan Word→PDF.
6. Error handling: kegagalan ekstraksi per halaman tidak lagi langsung mematikan seluruh dokumen; error dicatat agar export tidak crash.
7. OCR: checkbox benar-benar menjadi kontrol OCR; scan/foto PDF dapat diproses bila dicentang.
8. Contoh PDF warehouse digunakan sebagai test case, bukan template permanen.

Catatan teknis:
- Versi Cloudflare Pages tetap browser-side. Formatting workbook memakai SheetJS di browser; openpyxl adalah konsep pipeline/quality target, bukan runtime Python di Pages.
- CDN eksternal tetap dibutuhkan untuk PDF.js, SheetJS, Tesseract.js, docx, Mammoth, jsPDF, dan html2canvas.
