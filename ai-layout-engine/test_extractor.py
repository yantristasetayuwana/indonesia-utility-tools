from extractor import extract_pdf_layout


PDF_FILE = "sample.pdf"


result = extract_pdf_layout(PDF_FILE)


print("================================")
print("AI LAYOUT ENGINE - TEST")
print("================================")

print("File       :", result["file"])
print("Total Page :", result["total_pages"])


for page in result["pages"]:

    print()
    print("PAGE", page["page"])

    print(
        "Ukuran:",
        page["width"],
        "x",
        page["height"]
    )

    print(
        "Jumlah text:",
        len(page["elements"])
    )


    for element in page["elements"][:10]:

        print(
            element["text"],
            "| X:", round(element["x"], 2),
            "| Y:", round(element["y"], 2),
            "| W:", round(element["width"], 2),
            "| H:", round(element["height"], 2)
        )
