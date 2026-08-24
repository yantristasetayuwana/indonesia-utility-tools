from flask import Flask, request, send_file, jsonify, after_this_request
from flask_cors import CORS
from pathlib import Path
import tempfile
import zipfile
import shutil
import gc
import logging

from weighbridge_universal_engine import process

app = Flask(__name__)

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
    if request.method == "OPTIONS":
        return ("", 204)

    uploads = request.files.getlist("files")

    if not uploads:
        upload = request.files.get("file")
        if upload:
            uploads = [upload]

    if not uploads:
        return jsonify(
            error="No PDF uploaded. Use form field 'file' or 'files'."
        ), 400

    tmp_path = Path(tempfile.mkdtemp(prefix="weighbridge_"))
    outputs = []

    @after_this_request
    def cleanup(response):
        try:
            shutil.rmtree(tmp_path, ignore_errors=True)
            logger.info("Temporary files cleaned: %s", tmp_path)
        except Exception:
            logger.exception("Temporary cleanup failed: %s", tmp_path)

        gc.collect()
        return response

    try:
        for upload in uploads:
            name = Path(upload.filename or "input.pdf").name

            if not name.lower().endswith(".pdf"):
                return jsonify(error=f"Not a PDF: {name}"), 400

            pdf = tmp_path / name
            upload.save(str(pdf))

            if not pdf.exists() or pdf.stat().st_size == 0:
                return jsonify(error=f"Uploaded PDF is empty: {name}"), 400

            logger.info(
                "Converting %s (%.1f KB)",
                name,
                pdf.stat().st_size / 1024
            )

            # IMPORTANT:
            # weighbridge_universal_engine.process() returns an integer
            # status code:
            #   0 = PASS
            #   1 = CHECK REQUIRED
            #   2 = FAIL
            #
            # It does NOT return the XLSX Path.
            result = process(pdf, tmp_path)

            logger.info("Engine result for %s: %r", name, result)

            # Find the XLSX produced by the engine.
            # Do NOT call Path(result), because result can be int 0/1/2.
            candidates = [
                p for p in tmp_path.glob("*.xlsx")
                if p.is_file() and p.stat().st_size > 0
            ]

            if not candidates:
                status = result if isinstance(result, int) else None

                if status == 2:
                    message = (
                        f"Engine failed to extract data from: {name}"
                    )
                elif status == 1:
                    message = (
                        f"Engine completed with validation errors and "
                        f"produced no XLSX: {name}"
                    )
                else:
                    message = (
                        f"Conversion produced no XLSX: {name}"
                    )

                return jsonify(
                    error=message,
                    engine_status=status
                ), 422

            # The engine writes the workbook before returning its status.
            # Select the newest workbook generated for this request.
            generated = max(
                candidates,
                key=lambda p: p.stat().st_mtime
            )

            final_out = tmp_path / f"{pdf.stem}.xlsx"

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

            # Status 1 means the engine found validation/check issues,
            # but the XLSX was successfully generated. We still return it.
            if isinstance(result, int) and result == 2:
                return jsonify(
                    error=f"Engine failed: {name}",
                    engine_status=result
                ), 422

        # One PDF -> direct XLSX
        if len(outputs) == 1:
            return send_file(
                str(outputs[0]),
                as_attachment=True,
                download_name=outputs[0].name,
                mimetype=XLSX_MIMETYPE,
                max_age=0,
            )

        # Multiple PDFs -> ZIP
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
