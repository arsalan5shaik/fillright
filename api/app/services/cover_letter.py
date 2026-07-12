from app.schemas.jd_analysis import JDAnalysis
from app.schemas.resume import ParsedResume
from app.services.llm.client import call_text


def generate_cover_letter(
    resume: ParsedResume,
    jd_analysis: JDAnalysis,
    *,
    company: str,
    job_title: str | None,
    user_id: str,
) -> str:
    required_keywords = [k.term for k in jd_analysis.keywords if k.required]
    nice_to_have = [k.term for k in jd_analysis.keywords if not k.required]

    prompt = (
        f"Write a personalized, professional cover letter for "
        f"{resume.contact.full_name or 'the candidate'} applying to the "
        f"{job_title or 'open'} role at {company}. Speak directly to the job "
        "requirements below, referencing the candidate's actual relevant "
        "experience from their resume - never invent employers, titles, "
        "dates, or accomplishments they don't have. 3-4 paragraphs, "
        "professional tone, no generic filler, no placeholder brackets.\n\n"
        f"Required keywords to address: {', '.join(required_keywords) or 'none specified'}\n"
        f"Nice-to-have keywords: {', '.join(nice_to_have) or 'none specified'}\n"
        f"Seniority level: {jd_analysis.seniority or 'not specified'}\n\n"
        f"Candidate resume (JSON): {resume.model_dump_json()}"
    )
    return call_text("cover_letter", prompt, user_id=user_id)
