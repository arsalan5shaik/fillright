import io

import fitz
from docx import Document

from app.schemas.resume import ParsedResume
from app.services.llm.client import call_structured


def extract_text(file_bytes: bytes, file_type: str) -> str:
    if file_type == "pdf":
        with fitz.open(stream=file_bytes, filetype="pdf") as doc:
            return "\n".join(page.get_text() for page in doc)
    if file_type == "docx":
        document = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in document.paragraphs)
    raise ValueError(f"Unsupported file type: {file_type}")


def parse_resume(file_bytes: bytes, file_type: str, *, user_id: str) -> ParsedResume:
    text = extract_text(file_bytes, file_type)
    prompt = (
        "Extract structured resume data (contact info, work experience, "
        "education, skills, certifications) from the resume text below. "
        "Only include information actually present in the text — never "
        "invent or infer missing details.\n\n" + text
    )
    return call_structured("resume_parsing", prompt, ParsedResume, user_id=user_id)
