INDONESIA UTILITY TOOLS — V1.5 SMART CONVERTER FIX

Perbaikan: path assets relatif agar tools dapat dites lokal maupun di Cloudflare Pages; tombol Export hanya aktif setelah file berhasil dibaca; diagnostik library; XLSX runtime diperbaiki.

V1.1 FIX - ROOT RELATIVE ASSETS

Semua tool HTML menggunakan root-relative:
  /assets/style.css
  /assets/app.js (jika digunakan)

UPLOAD:
1. Extract ZIP.
2. GitHub repository > folder tools/.
3. Upload/replace seluruh file HTML di folder tools/.
4. Commit changes.
5. Tunggu Cloudflare Pages automatic deployment selesai.

Jangan ubah Build command Cloudflare.
