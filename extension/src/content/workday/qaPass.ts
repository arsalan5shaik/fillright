import type { ResolvedAnswer } from "../../lib/types";
import { markField } from "./confidenceUi";
import type { UnmatchedTextField } from "./fillEngine";
import { setFieldValue } from "./formUtils";
import { injectAnswerPanel } from "./qaInlineUi";

// Below this, a label is unlikely to be a real question (e.g. "Zip" or a
// stray structural element FillRight just doesn't recognize) - calling the
// LLM on those would waste a real API call for no benefit.
const MIN_LABEL_LENGTH = 15;

type ResolveResponse = { ok: true; data: ResolvedAnswer } | { ok: false; error: string } | undefined;

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function resolveAndFillField({ element, labelText }: UnmatchedTextField): Promise<void> {
  const response = await sendMessage<ResolveResponse>({ type: "RESOLVE_QUESTION", questionText: labelText });
  if (!response || !response.ok) return; // leave the field unfilled - no worse than before this pass ran

  const { answerId, answerText, source } = response.data;
  setFieldValue(element, answerText);
  markField(element, "low");

  let isSaved = true;
  let currentText = answerText;

  injectAnswerPanel(element, {
    sourceLabel:
      source === "answer_bank"
        ? "reused your saved answer - review before submitting."
        : "AI-generated - review before submitting.",
    // Answers reused from the bank are already saved from a prior
    // application - nothing new to opt into here, so no toggle shown.
    showSaveToggle: source === "llm_generated",
    initialChecked: true,
    onToggle: (checked) => {
      isSaved = checked;
      void sendMessage(
        checked ? { type: "UPDATE_ANSWER", answerId, answerText: currentText } : { type: "DELETE_ANSWER", answerId },
      );
    },
  });

  // Keeps the saved answer in sync if the user edits the field afterward -
  // otherwise the bank would retain the original LLM text even though
  // something else is what actually gets submitted.
  element.addEventListener("blur", () => {
    if (!isSaved || element.value === currentText) return;
    currentText = element.value;
    void sendMessage({ type: "UPDATE_ANSWER", answerId, answerText: currentText });
  });
}

export async function runQaPass(fields: UnmatchedTextField[]): Promise<number> {
  const candidates = fields.filter((f) => f.labelText.trim().length >= MIN_LABEL_LENGTH);
  await Promise.all(candidates.map(resolveAndFillField));
  return candidates.length;
}
