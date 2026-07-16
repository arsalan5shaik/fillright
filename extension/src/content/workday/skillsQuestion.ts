import { markField } from "./confidenceUi";
import type { UnmatchedTextField } from "./fillEngine";
import { setFieldValue } from "./formUtils";

const SKILLS_LABEL_PATTERN = /\bskills?\b/i;
const MAX_KEYWORDS = 8;

function dispatchEnterKey(el: HTMLElement): void {
  const eventInit: KeyboardEventInit = { key: "Enter", code: "Enter", bubbles: true };
  el.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  el.dispatchEvent(new KeyboardEvent("keyup", eventInit));
}

/** Orders the user's own résumé skills so ones the JD also asks for come
 * first (most relevant tags surfaced), without adding any skill the user
 * doesn't actually have - the JD keywords are only used for ordering, never
 * as the source. */
function orderSkillsByJdRelevance(resumeSkills: string[], jdKeywords: string[]): string[] {
  const jdLower = new Set(jdKeywords.map((k) => k.trim().toLowerCase()));
  const relevant = resumeSkills.filter((s) => jdLower.has(s.trim().toLowerCase()));
  const rest = resumeSkills.filter((s) => !jdLower.has(s.trim().toLowerCase()));
  return [...relevant, ...rest];
}

/** A "skills" field asks for individual keyword tags, not a prose
 * paragraph - routing it through the free-text answer-bank/AI resolver
 * (which doesn't know the field expects short discrete terms) produces
 * exactly that mismatch. Fills from the user's OWN résumé skills (short
 * terms like "Python", "AWS"), NOT the JD's requirement phrases - live
 * testing showed the JD-keyword source typing an irrelevant sentence-long
 * requirement ("NX (CAD) and related tools to develop and maintain 3D
 * models…") into the field. JD keywords are used only to order the user's
 * skills by relevance. Types each one and commits it with Enter (the
 * standard tag/chip-input pattern); if the field doesn't clear after Enter
 * (not actually a chip input), falls back to one comma-separated value. */
export function fillSkillsQuestion(field: UnmatchedTextField, resumeSkills: string[], jdKeywords: string[]): boolean {
  if (!SKILLS_LABEL_PATTERN.test(field.labelText) || resumeSkills.length === 0) return false;

  const { element } = field;
  const selected = orderSkillsByJdRelevance(resumeSkills, jdKeywords).slice(0, MAX_KEYWORDS);

  let committedAny = false;
  for (const keyword of selected) {
    setFieldValue(element, keyword);
    dispatchEnterKey(element);
    if (element.value.trim() === "") {
      committedAny = true;
    } else {
      break;
    }
  }

  if (!committedAny) {
    setFieldValue(element, selected.join(", "));
  }

  markField(element, "low");
  return true;
}
