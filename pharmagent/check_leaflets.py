from pathlib import Path

from pypdf import PdfReader


LEAFLETS_DIR = Path("data/leaflets")
EXPECTED_PDF_COUNT = 20
MINIMUM_TEXT_LENGTH = 200


def check_pdf(pdf_path: Path) -> tuple[int, int]:
    """Return the page count and extracted character count."""

    reader = PdfReader(str(pdf_path))

    extracted_text = []

    for page in reader.pages:
        page_text = page.extract_text()

        if page_text:
            extracted_text.append(page_text)

    complete_text = "\n".join(extracted_text).strip()

    return len(reader.pages), len(complete_text)


def main() -> None:
    if not LEAFLETS_DIR.exists():
        print(f"ERROR: Folder not found: {LEAFLETS_DIR.resolve()}")
        return

    pdf_files = sorted(LEAFLETS_DIR.glob("*.pdf"))

    print("=" * 65)
    print("PharmAgent leaflet verification")
    print("=" * 65)
    print(f"Folder: {LEAFLETS_DIR.resolve()}")
    print(f"PDF files found: {len(pdf_files)}")
    print()

    successful_files = 0
    problem_files = 0

    for pdf_path in pdf_files:
        try:
            page_count, character_count = check_pdf(pdf_path)

            if character_count >= MINIMUM_TEXT_LENGTH:
                status = "OK"
                successful_files += 1
            else:
                status = "TOO LITTLE TEXT"
                problem_files += 1

            print(
                f"{status:<16} "
                f"{pdf_path.name:<28} "
                f"pages={page_count:<4} "
                f"characters={character_count}"
            )

        except Exception as error:
            problem_files += 1

            print(
                f"{'ERROR':<16} "
                f"{pdf_path.name:<28} "
                f"{type(error).__name__}: {error}"
            )

    print()
    print("=" * 65)
    print(f"Readable PDFs: {successful_files}")
    print(f"Problem PDFs:  {problem_files}")

    if len(pdf_files) != EXPECTED_PDF_COUNT:
        print(
            f"WARNING: Expected {EXPECTED_PDF_COUNT} PDFs, "
            f"but found {len(pdf_files)}."
        )

    if (
        len(pdf_files) == EXPECTED_PDF_COUNT
        and problem_files == 0
    ):
        print("SUCCESS: All 20 leaflet PDFs are ready for ingestion.")
    else:
        print("FAILED: Fix the reported PDF problems before ingestion.")

    print("=" * 65)


if __name__ == "__main__":
    main()