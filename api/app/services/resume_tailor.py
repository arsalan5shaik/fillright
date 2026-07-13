from app.schemas.jd_analysis import JDAnalysis
from app.schemas.resume import ParsedResume
from app.schemas.tailored_resume import TailoredResume
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
        "Lightly tailor this resume for the job description already "
        "analyzed below - this is a light edit, not a rewrite. Make the "
        "minimum changes needed: reorder work-experience entries and "
        "bullets only if it meaningfully improves relevance to this role, "
        "and adjust wording only where a bullet already describes a skill "
        "the JD calls by a different but equivalent term (e.g. 'React.js' "
        "-> 'React' if the JD says 'React'). Keep each bullet's original "
        "length, level of detail, and meaning - do not expand, embellish, "
        "or add new bullets. Do not add a professional summary or any "
        "section that isn't already in the source resume - the source has "
        "none, and none should be invented. The tailored resume's total "
        "length must not exceed the source resume's, so it still fits on "
        "the same number of pages.\n\n"
        "HARD CONSTRAINT: every company name, job title, and start/end date "
        "in your output must exactly match an entry in the source resume "
        "below, verbatim. Never invent, merge, or alter employers, titles, "
        "or dates. Never fabricate content.\n\n"
        f"Required JD keywords: {', '.join(required_keywords) or 'none specified'}\n"
        f"Nice-to-have JD keywords: {', '.join(nice_to_have) or 'none specified'}\n"
        f"Seniority: {jd_analysis.seniority or 'not specified'}\n\n"
        f"Source resume (JSON): {source.model_dump_json()}"
    )


def tailor_resume(source: ParsedResume, jd_analysis: JDAnalysis, *, user_id: str) -> TailoredResume:
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

    return result
