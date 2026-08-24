from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from pathlib import Path
import tempfile
import zipfile
import io

from weighbridge_universal_engine import convert_pdf_to_excel

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.get("/")
def health():
    return jsonify(service="Weighbridge Universal Converter", status="OK")

@app.route("/api/weighbridge/convert", methods=["POST", "OPTIONS"])
def convert_api():
    if request.method == "OPTIONS":
        return ("", 204)

    uploads = request.files.getlist("files")
    if not uploads:
        upload = request.files.get("file")
        uploads = [upload] if upload else []

    if not uploads:
        return jsonify(error="No PDF uploaded"), 400

    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)
        outputs = []

        for upload in uploads:
            name = Path(upload.filename or "input.pdf").name
            if not name.lower().endswith(".pdf"):
                return jsonify(error=f"Not a PDF: {name}"), 400

            pdf = td / name
            upload.save(pdf)

            try:
                generated = Path(convert_pdf_to_excel(pdf, td))
            except Exception as exc:
                app.logger.exception("Conversion failed")
                return jsonify(error=f"Conversion failed: {name}", detail=str(exc)), 500

            if not generated.exists():
                return jsonify(error=f"Conversion produced no XLSX: {name}"), 422

            final_out = td / f"{pdf.stem}.xlsx"
            if generated.resolve() != final_out.resolve():
                if final_out.exists():
                    final_out.unlink()
                generated.replace(final_out)

            outputs.append(final_out)

        if len(outputs) == 1:
            return send_file(
                outputs[0], as_attachment=True, download_name=outputs[0].name,
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )

        mem = io.BytesIO()
        with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as z:
            for out in outputs:
                z.write(out, out.name)
        mem.seek(0)
        return send_file(mem, as_attachment=True, download_name="hasil_weighbridge.zip",
                         mimetype="application/zip")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
