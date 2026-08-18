# TEST REPORT — PDF TO EXCEL & MERGE PDF V2.2

## PDF → Excel

Test source:
- `Detail Received 16 Agustus 2026(1).pdf`
- 3 pages
- 112 data rows, numbered 1–112

Source inspection confirms:
- Page 1: rows 1–36
- Page 2: rows 37–77
- Page 3: rows 78–112
- Footer total: 112 rit

The previous repaired workbook found in the project history reports only 88 detected data rows, so it did NOT fully match the source.

V2.2 parser test:
- 3 pages detected
- 112 rows reconstructed
- 10 data columns reconstructed
- first row: 1 / TLP260011529 / BE8131ACU / 07:54 / 09:08 / 14.730 / 4.200 / 10.530 / PT. Aman Jaya Perdana / PT. Aman Jaya Perdana
- last row: 112 / TO26006590 / BE8465CU / 20:03 / 20:52 / 29.880 / 8.370 / 21.510 / PT Maju Bersama Anggiat Minuk / PT Maju Bersama Anggiat Minuk
- sequence validation: PASS
- page/footer noise excluded

## Merge PDF

The previous implementation had two issues:
1. It accepted `image/*` even though the merger calls `PDFDocument.load()` on every input, so image inputs were not actually supported.
2. It had no per-file error handling, making corrupt/encrypted input fail without a useful message.

V2.2:
- accepts PDF only
- supports multiple files
- supports reorder ↑ / ↓
- supports remove and clear
- validates each PDF before merging
- gives a useful error naming the problematic file
- downloads a single `merged-pdf.pdf`

## Important

This patch has been tested against the available 3-page PDF structure and the parser logic. A final browser/production QA pass should still be performed after the patch is uploaded to GitHub and deployed to Cloudflare Pages.


## V2.2-PATCH-2 — Source Header/Footer Preservation
- Footer proximity is no longer a row-removal rule.
- Header/footer text is preserved in `Raw Text` and `PDF Header Footer`.
- A source-order `Original Layout` sheet preserves every extracted line, including header/footer.
- `Converted Table` remains structured; only rows that fail data-row structure are excluded from that clean table.
