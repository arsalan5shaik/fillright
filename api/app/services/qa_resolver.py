def build_qa_prompt(question_text: str) -> str:
    return (
        "Answer this job application question directly and concisely, as if "
        "you were the candidate. If it's a short factual/yes-no question, "
        "answer in one sentence. If it's an open-ended prompt (e.g. 'why do "
        "you want to work here'), write 2-4 sentences. Do not fabricate "
        "specific facts about the candidate you don't know - keep the answer "
        "general and professional if specifics aren't available.\n\n"
        f"Question: {question_text}"
    )


def embedding_to_pgvector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(repr(x) for x in embedding) + "]"


def build_choice_prompt(question_text: str, options: list[str]) -> str:
    numbered = "\n".join(f"- {o}" for o in options)
    return (
        "A job application asks the question below and requires the candidate "
        "to choose exactly one of the given options. Pick the single most "
        "appropriate option for a typical qualified candidate, answering as "
        "the candidate. Return the chosen option text VERBATIM (exactly as "
        "written in the list). If none is clearly appropriate, return the "
        "safest neutral option. Do not invent an option that isn't listed.\n\n"
        f"Question: {question_text}\n\nOptions:\n{numbered}"
    )


def snap_to_option(answer: str, options: list[str]) -> str | None:
    """Maps the model's answer back onto one of the real options - exact
    (case-insensitive) first, then a containment match either direction - so a
    near-miss ("Yes." vs "Yes") still selects a real option rather than nothing.
    Returns None if nothing matches."""
    norm = answer.strip().lower()
    for opt in options:
        if opt.strip().lower() == norm:
            return opt
    for opt in options:
        o = opt.strip().lower()
        if o and (o in norm or norm in o):
            return opt
    return None
