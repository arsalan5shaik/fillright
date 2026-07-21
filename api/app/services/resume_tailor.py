import re

from app.schemas.jd_analysis import JDAnalysis
from app.schemas.resume import ParsedResume
from app.schemas.tailored_resume import ResumeCritique, TailoredResume
from app.services.llm.client import call_structured


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def validate_structure(tailored: TailoredResume, source: ParsedResume) -> list[str]:
    """Mechanical backstop: every tailored work-experience entry's company+title
    must match a source entry exactly, its dates must match, and it must keep at
    least as many bullets as the source (the tailoring sometimes collapsed two
    bullets into one, dropping quantified achievements). Reject/retry rather
    than trust the prompt."""
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
            violations.append(f"Start date changed for {entry.company}")
        if _normalize(entry.end_date) != _normalize(source_entry.end_date):
            violations.append(f"End date changed for {entry.company}")
        if len(entry.bullets) < len(source_entry.bullets):
            violations.append(
                f"'{entry.company} - {entry.title}' has {len(entry.bullets)} bullets but the "
                f"source has {len(source_entry.bullets)} - keep every bullet (do not merge or drop any)"
            )

    return violations


# Preserve backward-compatible name used elsewhere/tests.
validate_no_fabrication = validate_structure


# Generic skill/verb terms that a JD lists but that aren't a specific technology
# a candidate must "have" - fine to use when rewording, so not treated as
# fabrication if they appear in tailored bullets without being in the source.
_GENERIC_SKILL_TERMS = {
    "software engineering", "software development", "software development lifecycle",
    "debugging", "testing", "development", "design", "documentation", "analysis",
    "troubleshooting", "communication", "collaboration", "agile", "problem solving",
    "coding", "monitoring", "automation", "root cause analysis", "health monitoring",
    "configuration", "delivery", "services", "apis", "rest", "rest apis", "cloud",
    "scheduling", "timing", "learning", "verbal communication", "written communication",
    "distributed computing", "distributed systems", "microservice architecture",
    "prompt engineering", "ai", "ai-driven tools", "networking", "database",
}


def _source_blob(source: ParsedResume) -> str:
    parts = [*source.skills]
    for e in source.work_experience:
        parts.append(e.title)
        parts.extend(e.bullets)
    parts.extend(f"{e.degree or ''} {e.field_of_study or ''}" for e in source.education)
    return " ".join(parts).lower()


def _keyword_terms(keyword: str) -> list[str]:
    """A JD keyword plus any tech-symbol sub-token (c#, c++, .net, node.js) so a
    keyword like 'C#/.NET programming' is still matched by its 'C#/.NET' core."""
    terms = [keyword.strip().lower()]
    for word in re.split(r"[\s,/]+", keyword):
        wl = word.strip().lower()
        if wl and re.search(r"[#+]|\.\w", wl):
            terms.append(wl)
    return [t for t in terms if t]


# Words too generic to be evidence of domain fabrication on their own - a
# tailored bullet using "software" or "development" isn't claiming a domain the
# candidate lacks, so these are ignored when checking a multi-word JD keyword's
# individual words (unlike "embedded" or "avionics", which are).
_GENERIC_WORDS = {
    "software", "development", "systems", "system", "operating", "engineering",
    "design", "designing", "testing", "programming", "application", "applications",
    "management", "services", "service", "cloud", "computing", "architecture",
    "distributed", "framework", "frameworks", "platform", "platforms", "tools",
    "technology", "technologies", "solution", "solutions", "experience", "knowledge",
    "modern", "related", "based", "using", "various", "field",
}


def _distinctive_words(keyword: str) -> list[str]:
    """The domain-specific words of a multi-word JD keyword (e.g. 'embedded' from
    'embedded systems', 'real-time' from 'real-time operating systems') - so
    injecting the domain adjective alone still counts as fabrication, not just
    the exact phrase."""
    return [w for w in re.split(r"\s+", keyword.strip().lower()) if len(w) >= 5 and w not in _GENERIC_WORDS]


def _lacking_keywords(source: ParsedResume, jd_analysis: JDAnalysis) -> list[str]:
    """JD keywords the candidate's résumé gives NO basis for - passed to the
    prompt as an explicit 'do not introduce these' list so the model doesn't
    reframe software/data work as embedded/avionics/real-time to match the JD."""
    blob = _source_blob(source)
    lacking: list[str] = []
    seen: set[str] = set()
    for kw in jd_analysis.keywords:
        term = kw.term.strip()
        tl = term.lower()
        if not tl or tl in seen or tl in _GENERIC_SKILL_TERMS:
            continue
        if not any(len(t) >= 2 and t in blob for t in _keyword_terms(term)):
            lacking.append(term)
            seen.add(tl)
    return lacking


def find_fabricated_skills(tailored: TailoredResume, source: ParsedResume, jd_analysis: JDAnalysis) -> list[str]:
    """JD keywords that show up in the tailored bullets but nowhere in the source
    résumé - i.e. a technology the candidate doesn't actually have, injected to
    match the JD (observed live: a Java/Spring dev's bullets rewritten as
    'C#/.NET'). Generic verbs/nouns are excluded so ordinary rewording isn't
    flagged."""
    blob = _source_blob(source)
    tailored_text = " ".join(b for e in tailored.work_experience for b in e.bullets).lower()
    fabricated: list[str] = []
    for keyword in {k.term for k in jd_analysis.keywords}:
        if keyword.strip().lower() in _GENERIC_SKILL_TERMS:
            continue
        # Check the full keyword, its tech-symbol core, AND its distinctive
        # domain words - so "embedded" leaking in from "embedded systems" (even
        # when the exact phrase never appears) is still caught as fabrication.
        for term in _keyword_terms(keyword) + _distinctive_words(keyword):
            if len(term) >= 2 and term in tailored_text and term not in blob:
                fabricated.append(keyword.strip())
                break
    return fabricated


# A parenthetical longer than this is almost certainly the critique's meta-note
# ("(scope aligned to existing team projects; avoided implying ownership…)")
# rather than a legitimate inline note like "(AWS)" - strip it from the bullet.
_META_PAREN = re.compile(r"\s*\([^)]{25,}\)")


def _clean_bullet(text: str) -> str:
    return _META_PAREN.sub("", text).strip()


def _overlap_skills(source: ParsedResume, jd_analysis: JDAnalysis) -> list[str]:
    """The candidate's OWN skills (from their résumé) that the JD also asks for -
    i.e. legitimate, non-fabricated terms to surface prominently in the reworded
    bullets. Matches a résumé skill to a JD keyword when either contains the
    other (so 'C++' matches 'C++ programming', 'AWS' matches 'AWS services')."""
    blob = _source_blob(source)
    overlap: list[str] = []
    seen: set[str] = set()
    for kw in jd_analysis.keywords:
        term = kw.term.strip()
        tl = term.lower()
        if not tl or tl in seen:
            continue
        # Present in the candidate's real résumé text (skills/bullets/titles)?
        for sub in _keyword_terms(term):
            if len(sub) >= 2 and sub in blob:
                overlap.append(term)
                seen.add(tl)
                break
    return overlap


def _build_prompt(source: ParsedResume, jd_analysis: JDAnalysis) -> str:
    required_keywords = [k.term for k in jd_analysis.keywords if k.required]
    nice_to_have = [k.term for k in jd_analysis.keywords if not k.required]
    overlap = _overlap_skills(source, jd_analysis)
    lacking = _lacking_keywords(source, jd_analysis)
    return (
        "Tailor this résumé for the job description analyzed below by REWRITING "
        "the work-experience bullet points. Do not return the bullets unchanged - "
        "genuinely reword each one so the prior role clearly speaks to THIS job's "
        "responsibilities and the recruiter immediately sees the fit, while "
        "staying truthful about what the candidate actually did.\n\n"
        "How to weave in keywords (the important part):\n"
        "- Naturally work the JD's own terminology and the skills listed below "
        "into the bullets WHERE IT HONESTLY FITS the work already described. "
        "Reframe existing accomplishments in the language this job uses.\n"
        "- PRIORITIZE the candidate's own skills that this JD also asks for "
        "(listed under 'Skills to emphasize' below) - surface these prominently "
        "since they're both real AND relevant.\n"
        "- Make it read like a strong human-written résumé: keywords woven into "
        "real sentences, never a keyword list or an obvious stuffing. If a "
        "keyword doesn't plausibly fit the actual work, leave it out.\n\n"
        "Honesty and format rules:\n"
        "- Only edit the bullet text. Keep the SAME number of bullets per role "
        "(never merge or drop any), each about the original length, so it fits "
        "the same one page. Do NOT add a summary or new section (summary null).\n"
        "- Preserve real metrics; never inflate or invent a number.\n"
        "- Do NOT copy sentences from the job description verbatim.\n"
        "- CRITICAL: never introduce a hard technology, tool, framework, "
        "language, or DOMAIN the candidate's résumé gives no basis for. Do not "
        "reframe software or data work as a domain they never worked in - never "
        "call it 'embedded', 'real-time', 'avionics', 'firmware', 'hardware', "
        "etc., and never turn a Java/Spring engineer's work into 'C#/.NET'. See "
        "the explicit 'Do NOT introduce' list below. Reframe what's genuinely "
        "there using the overlapping skills; invent nothing.\n"
        "- Each bullet is FINAL résumé text: no parenthetical notes or "
        "commentary about your edits.\n\n"
        "HARD CONSTRAINT: every company name, job title, and start/end date must "
        "match the source résumé verbatim. Never invent, merge, or alter "
        "employers, titles, or dates.\n\n"
        f"Skills to emphasize (candidate's own skills this JD wants - lead with these): "
        f"{', '.join(overlap) or 'none directly overlap; reframe existing work in the JD''s language without claiming new skills'}\n"
        f"Do NOT introduce or imply these (résumé gives no basis - the candidate has NOT done these): "
        f"{', '.join(lacking) or 'none'}\n"
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
        "candidate's ORIGINAL résumé, and (3) a TAILORED version. Scrutinize each "
        "tailored work-experience bullet the way a skeptical recruiter who checks "
        "references would. For the candidate's actual role (company, title, "
        "seniority in the ORIGINAL résumé), is each tailored bullet believable, or "
        "does it overreach - claiming scope, seniority, ownership, or especially "
        "TOOLS/TECHNOLOGIES the original résumé gives no basis for?\n\n"
        "Return, for every entry, each bullet with: the bullet text (original "
        "field), plausible=true/false, and a revised version. If plausible, "
        "revised equals the bullet unchanged. If NOT plausible (or it claims a "
        "technology the candidate doesn't actually have), revise it DOWN to "
        "something believable using only the candidate's real skills. IMPORTANT: "
        "the revised field must be ONLY the final résumé bullet text - no notes, "
        "no parentheses explaining what you changed, no meta-commentary. Return "
        "the SAME number of bullets per entry as given. Keep company and title "
        "exactly as in the tailored résumé.\n\n"
        f"Role requirements: {', '.join(required_keywords) or 'none specified'}; "
        f"seniority {jd_analysis.seniority or 'not specified'}.\n\n"
        f"Original résumé (JSON): {source.model_dump_json()}\n\n"
        f"Tailored résumé (JSON): {tailored.model_dump_json()}"
    )


def _apply_critique(tailored: TailoredResume, critique: ResumeCritique) -> TailoredResume:
    """Replaces each tailored entry's bullets with the recruiter-revised ones
    (cleaned of any leaked meta-notes), matched by company+title. Guards against
    the critique dropping bullets: only swaps in the revised set if it has at
    least as many bullets."""
    revised_by_key: dict[tuple[str, str], list[str]] = {}
    for entry in critique.entries:
        key = (_normalize(entry.company), _normalize(entry.title))
        revised_by_key[key] = [_clean_bullet(b.revised) for b in entry.bullets if _clean_bullet(b.revised)]

    result = tailored.model_copy(deep=True)
    for entry in result.work_experience:
        key = (_normalize(entry.company), _normalize(entry.title))
        revised = revised_by_key.get(key)
        if revised and len(revised) >= len(entry.bullets):
            entry.bullets = revised
    return result


def _tailor_with_retry(prompt: str, source: ParsedResume, user_id: str) -> TailoredResume:
    result = call_structured("resume_tailoring", prompt, TailoredResume, user_id=user_id)
    violations = validate_structure(result, source)
    if violations:
        retry_prompt = prompt + "\n\nYour previous attempt violated these rules - fix them: " + "; ".join(violations)
        result = call_structured("resume_tailoring", retry_prompt, TailoredResume, user_id=user_id)
        if validate_structure(result, source):
            raise ValueError("Resume tailoring failed the guardrail after retry")
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
    result = _tailor_with_retry(prompt, source, user_id)

    # De-fabricate: if any JD skill leaked into the bullets without being in the
    # source résumé, redo the tailoring with those terms explicitly forbidden.
    fabricated = find_fabricated_skills(result, source, jd_analysis)
    if fabricated:
        fix_prompt = prompt + (
            "\n\nYour previous attempt claimed skills/technologies the candidate's "
            "résumé gives NO basis for: " + ", ".join(fabricated) + ". Remove every one "
            "and never imply the candidate used them - use only their real "
            "technologies from the source résumé."
        )
        result = _tailor_with_retry(fix_prompt, source, user_id)

    # Recruiter self-critique on the (de-fabricated) result: tones down any
    # remaining overreach. validate_structure runs on the revised output as the
    # hard backstop - fall back to the pre-critique version if it regressed.
    critique_prompt = _build_critique_prompt(result, source, jd_analysis, company, job_title)
    critique = call_structured("resume_critique", critique_prompt, ResumeCritique, user_id=user_id)
    revised = _apply_critique(result, critique)
    if not validate_structure(revised, source):
        return revised
    return result
