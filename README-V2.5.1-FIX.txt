Indonesia Utility Tools — V2.5.1 PDF → Excel FIX

Fix utama:
- Memuat local engine yang sebelumnya belum dimuat oleh halaman.
- Memperbaiki mismatch API: extractLocal/flattenLocal -> IULocalConvert.extractPdf/flattenTable.
- OCR lokal dipanggil bila checkbox OCR aktif atau text extraction lemah.
- Cloud AI tetap menjadi engine utama; local engine menjadi fallback.
- Tidak mengubah Merge PDF.

Upload/replace:
assets/converter-engine-local.js
tools/pdf-ke-excel.html

Pastikan functions/api/pdf-excel.js V2.5 tetap ada dan secret Cloudflare:
AZURE_DI_ENDPOINT
AZURE_DI_KEY
