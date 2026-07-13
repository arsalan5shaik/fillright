import type { AutofillData } from "../../lib/types";
import { runFillPass } from "./fillEngine";
import { runQaPass } from "./qaPass";
import { showStatus } from "./statusUi";
import { buildValueProvider } from "./valueProvider";

/** Not the job-posting page (no JobPosting JSON-LD, checked by the caller)
 * and has enough form fields to plausibly be a wizard step - deliberately
 * broad rather than guessing a specific URL path segment, since the actual
 * apply-flow URL pattern hasn't been verified against a live tenant (see
 * Milestone 13 notes). Runs harmlessly on the Review step too - it just
 * won't find any empty fields to fill there. */
export function looksLikeApplicationForm(): boolean {
  return document.querySelectorAll("input, select, textarea").length >= 3;
}

type AutofillDataResponse = { ok: true; data: AutofillData } | { ok: false; error: string };

export function runApplicationFormFill(): void {
  showStatus("Filling application form...");

  chrome.runtime.sendMessage({ type: "GET_AUTOFILL_DATA" }, (response: AutofillDataResponse | undefined) => {
    if (chrome.runtime.lastError) {
      showStatus(`Error: ${chrome.runtime.lastError.message}`);
      return;
    }
    if (!response || !response.ok) {
      showStatus(`Error: ${response?.error ?? "unknown error"}`);
      return;
    }

    const result = runFillPass(buildValueProvider(response.data));
    showStatus(
      `Filled ${result.filled} field(s) confidently, ${result.guessed} guessed (please review), ` +
        `checking ${result.unmatchedTextFields.length} unmapped field(s) for saved/AI answers...`,
    );

    void runQaPass(result.unmatchedTextFields).then((attempted) => {
      const stillUnfilled = result.unmatched - attempted;
      showStatus(
        `Filled ${result.filled} confidently, ${result.guessed} guessed (please review), ` +
          `${attempted} answered via your answer bank/AI (please review), ${Math.max(stillUnfilled, 0)} left for you to fill in.`,
      );
    });
  });
}
