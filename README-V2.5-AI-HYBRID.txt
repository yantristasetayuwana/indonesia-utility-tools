INDONESIA UTILITY TOOLS — V2.5 AI HYBRID PDF -> EXCEL

Tujuan
- Memaksimalkan akurasi PDF -> Excel dengan dua jalur:
  1) Azure AI Document Intelligence v4 prebuilt-layout untuk OCR + table/layout understanding.
  2) Browser local coordinate engine sebagai fallback bila AI Cloud belum dikonfigurasi/gagal.
- API key tidak ditanam di HTML/JavaScript. Simpan di Cloudflare Pages Environment Variables.

File
- tools/pdf-ke-excel.html
- assets/converter-engine.js
- functions/api/pdf-excel.js

Cloudflare Pages Variables
AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com
AZURE_DI_KEY=<secret>

Set sebagai secret/production environment variable. Jangan commit key ke GitHub.

Cara kerja
1. User upload PDF.
2. Browser mencoba /api/pdf-excel.
3. Cloudflare Pages Function mengirim PDF ke Azure Document Intelligence v4.
4. Azure mengembalikan struktur tabel + bounding/layout information.
5. Browser membuat XLSX.
6. Header/footer/page layout disimpan pada sheet PDF Layout agar tidak hilang.
7. Jika cloud tidak tersedia, engine lokal dipakai.

Catatan
- Tidak ada converter yang bisa menjamin 100% sempurna untuk semua PDF. PDF yang berbeda dapat memiliki layout, font, scan, rotasi, atau tabel berbeda.
- Untuk dokumen produksi, lakukan validasi jumlah baris dan sampel sebelum memakai data sebagai sumber resmi.
- Azure Document Intelligence v4 mendukung PDF sampai 2.000 halaman; batas ukuran dan kuota bergantung tier.
