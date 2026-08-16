INDONESIA UTILITY TOOLS — V1.2 FIX

Perbaikan utama:
1. PDF → Excel: text item disusun berdasarkan posisi X/Y, baris dan kolom sederhana direkonstruksi, serta sheet Raw Text disediakan sebagai cadangan.
2. Excel → PDF: memakai jsPDF AutoTable untuk wrapping, header berulang, page break, multi-sheet, dan tabel lebar.
3. PDF → Word: ekstraksi teks per baris dengan DOCX generator yang lebih stabil dan pesan error yang jelas.

UPLOAD KE GITHUB
- Extract ZIP.
- Upload folder assets/ dan tools/ ke root repository.
- Pilih Replace/overwrite file yang sama.
- Commit changes.
- Tunggu Cloudflare Pages automatic deployment.

Cloudflare Pages:
- Framework preset: None
- Build command: exit 0
- Build output directory: kosong
- Root directory: / (kosong)

Catatan: PDF scan/foto membutuhkan OCR dan belum didukung pada versi ini. PDF digital dengan text layer adalah target utama.
