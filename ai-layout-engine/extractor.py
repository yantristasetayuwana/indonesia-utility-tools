"""
AI Layout Engine
PDF Layout Extractor

Tahap awal:
- Membaca PDF
- Mengambil teks
- Mengambil posisi teks
- Mengambil ukuran halaman

File ini BERDIRI SENDIRI.
Tidak berhubungan dengan engine PDF Excel Weighbridge.
"""

import fitz


def extract_pdf_layout(pdf_path):
    """
    Membaca PDF dan mengembalikan
    struktur layout dasar.
    """

    document = fitz.open(pdf_path)

    result = {
        "file": pdf_path,
        "total_pages": len(document),
        "pages": []
    }

    for page_number, page in enumerate(document):

        page_data = {
            "page": page_number + 1,
            "width": page.rect.width,
            "height": page.rect.height,
            "elements": []
        }

        blocks = page.get_text("dict")["blocks"]

        for block in blocks:

            if "lines" not in block:
                continue

            for line in block["lines"]:

                for span in line["spans"]:

                    text = span["text"].strip()

                    if not text:
                        continue

                    x0, y0, x1, y1 = span["bbox"]

                    page_data["elements"].append({
                        "type": "text",
                        "text": text,
                        "x": x0,
                        "y": y0,
                        "width": x1 - x0,
                        "height": y1 - y0,
                        "font_size": span["size"]
                    })

        result["pages"].append(page_data)

    document.close()

    return result
