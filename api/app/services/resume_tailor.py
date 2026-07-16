from app.schemas.jd_analysis import JDAnalysis
from app.schemas.resume import ParsedResume
from app.schemas.tailored_resume import ResumeCritique, TailoredResume
from app.services.llm.client import call_structured


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def validate_no_fabrication(tailored: TailoredResume, source: ParsedResume) -> list[str]:
    """Mechanical backstop for the never-fabricate guardrail: every tailored
    work-experience entry's company+title must match a source entry exactly,
    and its dates must match that same entry's dates. Reject/retry rather
    than trust the prompt alone."""
    violations: list[str] = []
    source_by_key = {(_normalize(e.company), _normalize(e.title)): e for e in source.work_experience}

    for entry in tailored.work_experience:
        key = (_normalize(entry.company), _normalize(entry.title))
        source_entry = source_by_key.get(key)
        if source_entry is None:
            violations.append(
                f"Tailored entry '{entry.company} - {entry.title}' has no matching "
                "company+title in the source resume"
            )
            continue
        if _normalize(entry.start_date) != _normalize(source_entry.start_date):
            violations.append(
                f"Start date changed for {entry.company}: "
                f"{entry.start_date!r} vs source {source_entry.start_date!r}"
            )
        if _normalize(entry.end_date) != _normalize(source_entry.end_date):
            violations.append(
                f"End date changed for {entry.company}: "
                f"{entry.end_date!r} vs source {source_entry.end_date!r}"
            )

    return violations


def _build_prompt(source: ParsedResume, jd_analysis: JDAnalysis) -> str:
    required_keywords = [k.term for k in jd_analysis.keywords if k.required]
    nice_to_have = [k.term for k in jd_analysis.keywords if not k.required]
    return (
        "Tailor this résumé for the job description analyzed below. This is a "
        "substantive rewrite of the work-experience bullet points - genuinely "
        "reword them so each prior role clearly speaks to THIS job's "
        "responsibilities and required skills. For each role: lead with the "
        "most relevant work, use the JD's own terminology for skills the "
        "candidate genuinely has, and frame accomplishments to foreground "
        "impact relevant to this role. Make it impressive but believable for "
        "the candidate's ACTUAL role, seniority, and company.\n\n"
        "Rules for staying honest and concise:\n"
        "- Keep the SAME number of bullets per role, each about the same "
        "length as the original, so the résumé still fits its original page "
        "count. Do NOT add a professional summary or any new section (leave "
        "summary null).\n"
        "- Preserve real metrics; never inflate a number or invent a new one.\n"
        "- Do NOT copy sentences from the job description verbatim.\n"
        "- Do NOT claim skills, tools, responsibilities, or achievements the "
        "candidate's original résumé gives no basis for - reword what's there, "
        "don't add what isn't.\n\n"
        "HARD CONSTRAINT: every company name, job title, and start/end date in "
        "your output must exactly match an entry in the source résumé, "
        "verbatim. Never invent, merge, or alter employers, titles, or dates.\n\n"
        f"Required JD keywords: {', '.join(required_keywords) or 'none specified'}\n"
        f"Nice-to-have JD keywords: {', '.join(nice_to_have) or 'none specified'}\n"
        f"Seniority: {jd_analysis.seniority or 'not specified'}\n\n"
        f"Source résumé (JSON): {source.model_dump_json()}"
    )


def _build_critique_prompt(
    tailored: TailoredResume,
    source: ParsedResume,
    jd_analysis: JDAnalysis,
    company: str,
    job_title: str | None,
) -> str:
    required_keywords = [k.term for k in jd_analysis.keywords if k.required]
    return (
        f"You are the hiring recruiter for the {job_title or 'open'} role at "
        f"{company}. Below is (1) the role's key requirements, (2) the "
        "candidate's ORIGINAL résumé, and (3) a TAILORED version rewritten to "
        "target your role. Scrutinize each tailored work-experience bullet the "
        "way a skeptical recruiter who checks references would. For the "
        "candidate's actual role (the company, title, and seniority shown in "
        "the ORIGINAL résumé), is each tailored bullet believable - or does it "
        "overreach: claiming scope, seniority, ownership, tools, or impact that "
        "role wouldn't plausibly have, or that the original résumé gives no "
        "basis for?\n\n"
        "For every work-experience entry, return each bullet with: the bullet "
        "text (original field), plausible=true/false, and a revised version. "
        "If it's plausible, set revised equal to the bullet unchanged. If it's "
        "NOT plausible, revise it DOWN to something believable for that actual "
        "role - still relevant to the job and well-phrased, but honest. Never "
        "inflate a bullet. Keep company and title for each entry exactly as in "
        "the tailored résumé.\n\n"
        f"Role requirements: {', '.join(required_keywords) or 'none specified'}; "
        f"seniority {jd_analysis.seniority or 'not specified'}.\n\n"
        f"Original résumé (JSON): {source.model_dump_json()}\n\n"
        f"Tailored résumé (JSON): {tailored.model_dump_json()}"
    )


def _apply_critique(tailored: TailoredResume, critique: ResumeCritique) -> TailoredResume:
    """Replaces each tailored entry's bullets with the recruiter-revised ones,
    matched by company+title. Entries the critique didn't cover keep their
    bullets unchanged."""
    revised_by_key: dict[tuple[str, str], list[str]] = {}
    for entry in critique.entries:
        key = (_normalize(entry.company), _normalize(entry.title))
        revised_by_key[key] = [b.revised.strip() for b in entry.bullets if b.revised.strip()]

    result = tailored.model_copy(deep=True)
    for entry in result.work_experience:
        key = (_normalize(entry.company), _normalize(entry.title))
        revised = revised_by_key.get(key)
        if revised:
            entry.bullets = revised
    return result


def tailor_resume(
    source: ParsedResume,
    jd_analysis: JDAnalysis,
    *,
    company: str,
    job_title: str | None,
    user_id: str,
) -> TailoredResume:
    prompt = _build_prompt(source, jd_analysis)
    result = call_structured("resume_tailoring", prompt, TailoredResume, user_id=user_id)

    violations = validate_no_fabrication(result, source)
    if violations:
        retry_prompt = (
            prompt
            + "\n\nYour previous attempt violated the hard constraint above in these "
            "ways - fix them exactly by using the source resume's company names, "
            "titles, and dates verbatim: " + "; ".join(violations)
        )
        result = call_structured("resume_tailoring", retry_prompt, TailoredResume, user_id=user_id)
        violations = validate_no_fabrication(result, source)
        if violations:
            raise ValueError(
                "Resume tailoring failed the fabrication guardrail after retry: " + "; ".join(violations)
            )

    # Recruiter self-critique: a second model, role-playing the recruiter for
    # this specific job, judges each rewritten bullet's plausibility for the
    # candidate's actual prior role and tones down any overreach. The mechanical
    # fabrication guardrail still runs on the revised output as the hard
    # backstop - if the critique somehow altered a company/title/date, we fall
    # back to the pre-critique version (which already passed).
    critique_prompt = _build_critique_prompt(result, source, jd_analysis, company, job_title)
    critique = call_structured("resume_critique", critique_prompt, ResumeCritique, user_id=user_id)
    revised = _apply_critique(result, critique)
    if not validate_no_fabrication(revised, source):
        return revised
    return result
