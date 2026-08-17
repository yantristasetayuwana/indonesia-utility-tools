INDONESIA UTILITY TOOLS — V2.1 SMART + AI ENGINE

Perbaikan utama:
- PDF table reconstruction tidak lagi hanya bergantung pada posisi kolom header.
- Header yang tergabung dalam satu PDF text span dipecah kembali secara semantik.
- Row parser mengenali pola No -> Ticket -> Truck -> In -> Out -> numeric weights -> company names.
- Dukungan nomor/ticket seperti TLP..., TO..., dll.
- Plat yang terpecah seperti "BE8005 BT" direkonstruksi menjadi satu nilai.
- Footer Page/Total tidak dimasukkan sebagai data.
- Validation engine menolak hasil AI yang mengubah jumlah baris/kolom.
- OCR tetap tersedia sebagai fallback.
- AI repair opsional dan hanya dipanggil bila user mengaktifkannya.

AI MODE

Cara paling aman di Cloudflare Pages:
1. Upload isi ZIP ke repository.
2. Pastikan folder /functions ikut ter-upload.
3. Di Cloudflare Pages, buka Settings -> Functions/Workers AI dan tambahkan Workers AI binding bernama AI.
4. Tidak perlu memasukkan API key ke JavaScript/browser.
5. Pada PDF -> Excel, centang "AI Repair" bila ingin AI melakukan pemeriksaan/perapian tambahan.

Alternatif OpenAI:
- Tambahkan secret OPENAI_API_KEY di Cloudflare.
- Opsional: OPENAI_MODEL (default gpt-5.6-luna).
- Jangan pernah menaruh API key di file HTML, JS, GitHub, atau localStorage.

Tanpa AI binding/secret:
- Semua parser lokal tetap berjalan.
- Tombol export tetap aktif.
- AI repair dilewati dan hasil lokal tetap dapat diekspor.

Catatan:
AI adalah lapisan verifikasi/perbaikan, bukan sumber data. Engine dilarang mengarang nilai yang tidak ada di sumber.
