# PDF → Excel V2.3 QA

Source: Detail Received 16 Agustus 2026(1).pdf
- Pages: 3
- Expected data rows: 112 (No. 1–112)
- Page extraction: 36 + 41 + 35 = 112 rows
- First row: 1 / TLP260011529 / BE8131ACU
- Last row: 112 / TO26006590 / BE8465CU
- Footer is preserved as source content; it is not used as a reason to delete rows.
- Data rows are anchored by the first numeric column, with schema-based fallback.
- Workbook sheets: Converted Table, Original Layout, Raw Text, Diagnostics.
- Export checks: XLSX dependency presence, explicit click handler, try/catch error reporting.
- XLSX CDN pinned to xlsx 0.18.5 for broader browser compatibility.

Target result: 112/112 rows, sequence 1–112, no data row removed because of footer proximity.
