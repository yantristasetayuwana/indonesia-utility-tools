INDONESIA UTILITY TOOLS V2 — SMART CONVERSION ENGINE

V2 changes the converter philosophy from format-specific extraction to generic detection + reconstruction + validation.

PDF -> Excel:
- Detects likely table headers automatically.
- Uses PDF text coordinates to infer column anchors.
- Reconstructs rows across pages.
- Filters repeated page headers and totals.
- Repairs numeric columns when a consistent arithmetic relation is detected.
- Keeps Raw Text fallback.
- Does not hardcode the supplied weighbridge PDF as the only format.

PDF -> Word:
- Preserves page/paragraph order and provides a structured table path for recognized reports.

Excel -> PDF:
- Processes all sheets, repeats headers, wraps cells, and handles wide sheets.

Word -> PDF:
- DOCX -> HTML -> rendered PDF while preserving headings, paragraphs, lists, tables and images where supported by the browser libraries.

JPG -> PDF:
- Multiple images, automatic orientation, aspect-ratio preservation, white background for transparency.

QUALITY CHECKS PERFORMED:
- All inline JavaScript syntax checks PASS.
- ZIP integrity check PASS.
- Benchmark PDF: 3 pages and 112 transactions verified independently from the supplied sample.
- Benchmark totals: Gross 2624.990, Tarra 738.300, Netto 1886.690.

IMPORTANT:
Browser-only external conversion libraries require an internet connection. Scanned/image-only PDFs still require OCR for true table reconstruction; V2 does not pretend to extract invisible text from an image-only PDF.
