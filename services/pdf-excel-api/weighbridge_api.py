from flask import Flask, request, send_file, jsonify, after_this_request
from flask_cors import CORS
from pathlib import Path
import tempfile
import zipfile
import io
import shutil
import gc
import os
import logging

from weighbridge_universal_engine import process

app = Flask(__name__)

# Allow requests from Cloudflare/static HTML frontend.
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["POST", "OPTIONS"],
        "allow_headers": ["Content-Type"],
    }
})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

XLSX_MIMETYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


@app.get("/")
def health():
    return jsonify({
        "service": "Weighbridge Universal Converter",
        "status": "OK"
    })


@app.route("/api/weighbridge/convert", methods=["POST", "OPTIONS"])
def convert_api():
    # Browser CORS preflight
    if request.method == "OPTIONS":
        return ("", 204)

    uploads = request.files.getlist("files")

    # Also accept the singular field used by many HTML forms.
    if not uploads:
        upload = request.files.get("file")
        if upload:
            uploads = [upload]

    if not uploads:
        return jsonify(error="No PDF uploaded. Use form field 'file' or 'files'."), 400

    tmp_path = Path(tempfile.mkdtemp(prefix="weighbridge_"))
    outputs = []

    # Cleanup must happen AFTER Flask has finished sending the response.
    @after_this_request
    def cleanup(response):
        try:
            shutil.rmtree(tmp_path, ignore_errors=True)
            logger.info("Temporary files cleaned: %s", tmp_path)
        except Exception:
            logger.exception("Temporary cleanup failed: %s", tmp_path)

        # Release Python-side objects where possible.
        gc.collect()
        return response

    try:
        for upload in uploads:
            name = Path(upload.filename or "input.pdf").name

            if not name.lower().endswith(".pdf"):
                return jsonify(error=f"Not a PDF: {name}"), 400

            pdf = tmp_path / name
            upload.save(str(pdf))

            # Basic validation. Some PDFs have leading whitespace before %PDF,
            # so do not reject solely on the first four bytes.
            if not pdf.exists() or pdf.stat().st_size == 0:
                return jsonify(error=f"Uploaded PDF is empty: {name}"), 400

            logger.info(
                "Converting %s (%.1f KB)",
                name,
                pdf.stat().st_size / 1024
            )

            result = process(pdf, tmp_path)

            # Engine may return Path/string, or create XLSX itself.
            generated = Path(result) if result else None

            if generated is None or not generated.exists():
                candidates = list(tmp_path.glob("*.xlsx"))
                # Exclude any previously selected output if necessary and
                # choose the newest generated workbook.
                if not candidates:
                    return jsonify(
                        error=f"Conversion produced no XLSX: {name}"
                    ), 422

                generated = max(
                    candidates,
                    key=lambda p: p.stat().st_mtime
                )

            if not generated.exists() or generated.stat().st_size == 0:
                return jsonify(
                    error=f"Conversion failed or produced empty XLSX: {name}"
                ), 422

            final_out = tmp_path / f"{pdf.stem}.xlsx"

            # Avoid replacing a file with itself.
            if generated.resolve() != final_out.resolve():
                if final_out.exists():
                    final_out.unlink()
                shutil.move(str(generated), str(final_out))

            outputs.append(final_out)

            logger.info(
                "Created %s (%.1f KB)",
                final_out.name,
                final_out.stat().st_size / 1024
            )

        # One PDF -> direct XLSX download.
        if len(outputs) == 1:
            response = send_file(
                str(outputs[0]),
                as_attachment=True,
                download_name=outputs[0].name,
                mimetype=XLSX_MIMETYPE,
                max_age=0,
            )
            return response

        # Multiple PDFs -> ZIP.
        zip_path = tmp_path / "hasil_weighbridge.zip"

        with zipfile.ZipFile(
            str(zip_path),
            "w",
            compression=zipfile.ZIP_DEFLATED
        ) as z:
            for out in outputs:
                z.write(str(out), arcname=out.name)

        if not zip_path.exists() or zip_path.stat().st_size == 0:
            return jsonify(error="ZIP output is empty."), 422

        return send_file(
            str(zip_path),
            as_attachment=True,
            download_name="hasil_weighbridge.zip",
            mimetype="application/zip",
            max_age=0,
        )

    except Exception as exc:
        logger.exception("Weighbridge conversion failed")

        # Cleanup immediately on an error. There is no download response
        # that still needs these files.
        try:
            shutil.rmtree(tmp_path, ignore_errors=True)
        except Exception:
            pass

        gc.collect()

        return jsonify(
            error="Conversion failed",
            detail=str(exc)
        ), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
