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
