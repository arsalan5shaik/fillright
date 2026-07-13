import io
from datetime import date as date_cls
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from xhtml2pdf import pisa

from app.schemas.resume import ContactInfo
from app.schemas.tailored_resume import TailoredResume

_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates"
_env = Environment(loader=FileSystemLoader(_TEMPLATES_DIR), autoescape=select_autoescape())


def _render_pdf(html: str) -> bytes:
    buf = io.BytesIO()
    result = pisa.CreatePDF(html, dest=buf)
    if result.err:
        raise RuntimeError(f"PDF rendering failed with {result.err} error(s)")
    return buf.getvalue()


def render_resume_pdf(resume: TailoredResume) -> bytes:
    template = _env.get_template("resume.html")
    html = template.render(resume=resume)
    return _render_pdf(html)


def render_cover_letter_pdf(text: str, contact: ContactInfo) -> bytes:
    template = _env.get_template("cover_letter.html")
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    html = template.render(contact=contact, date=date_cls.today().strftime("%B %d, %Y"), paragraphs=paragraphs)
    return _render_pdf(html)
