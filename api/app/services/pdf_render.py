import os
import sys
from pathlib import Path

if sys.platform == "win32":
    # WeasyPrint needs GTK's native Pango/Cairo/GObject libraries on Windows
    # (pip alone doesn't provide them - see the GTK3 Runtime for Windows
    # installer). This makes it work regardless of the calling shell's PATH,
    # and is a no-op on Linux (e.g. Render), which gets these via apt instead.
    _gtk_bin = Path(r"C:\Program Files\GTK3-Runtime Win64\bin")
    if _gtk_bin.exists() and str(_gtk_bin) not in os.environ.get("PATH", ""):
        os.environ["PATH"] = str(_gtk_bin) + os.pathsep + os.environ.get("PATH", "")
    _fontconfig_dir = Path(r"C:\Program Files\GTK3-Runtime Win64\etc\fonts")
    if _fontconfig_dir.exists():
        os.environ.setdefault("FONTCONFIG_PATH", str(_fontconfig_dir))

import weasyprint  # noqa: E402
from jinja2 import Environment, FileSystemLoader, select_autoescape  # noqa: E402

from app.schemas.tailored_resume import TailoredResume  # noqa: E402

_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates"
_env = Environment(loader=FileSystemLoader(_TEMPLATES_DIR), autoescape=select_autoescape())


def render_resume_pdf(resume: TailoredResume) -> bytes:
    template = _env.get_template("resume.html")
    html = template.render(resume=resume)
    return weasyprint.HTML(string=html).write_pdf()
