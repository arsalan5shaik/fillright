import type { ScanProgressMessage } from "../../lib/types";
import { looksLikeApplicationForm, runApplicationFormFill } from "./applicationForm";
import { findApplyButton, findApplyManuallyButton } from "./applyButton";
import { detectJobPosting } from "./detect";
import { getAssociatedLabelText } from "./formUtils";
import { showProgress, showStartButton, showStatus } from "./statusUi";

const posting = detectJobPosting();

if (posting) {
  chrome.runtime.onMessage.addListener((message: ScanProgressMessage) => {
    if (message.type === "SCAN_PROGRESS") {
      showProgress(message.status, message.percent);
    }
  });

  // Scanning (JD analysis, resume tailoring, cover letter) starts as soon as
  // a job posting is detected - no click needed. It keeps running in the
  // background regardless of what step of the application the user reaches
  // next; the wizard fill pass below never waits on it either.
  showProgress("Scanning job posting...", 5);
  chrome.runtime.sendMessage({ type: "SCAN_JOB_POSTING", posting }, () => {
    if (chrome.runtime.lastError) {
      showStatus(`Error: ${chrome.runtime.lastError.message}`);
    }
  });

  showStartButton(() => {
    const applyButton = findApplyButton();
    if (applyButton) {
      applyButton.click();
    } else {
      showStatus("Couldn't find the Apply button automatically - click Apply yourself to continue.");
    }
  });
}

/** Workday's whole application flow - the "Start Your Application" modal
 * (if the tenant shows one) and every wizard step after it - is client-side
 * routed and never triggers a fresh page load. This content script is only
 * ever injected once (on the job-posting page, or directly on a wizard page
 * if the user landed here straight), so it has to keep re-checking the DOM
 * itself on every render instead of relying on being re-injected per step. */
let modalHandled = false;
let lastFillSignature: string | null = null;

/** Fingerprints the current step by its field labels, not a heading or the
 * URL - Workday tenants commonly keep a persistent job-title heading (and
 * sometimes the same URL) visible across every wizard step via client-side
 * routing, so either of those alone can look unchanged from one step to the
 * next even though the actual fields on the page are completely different. */
function currentStepSignature(): string {
  const labels = Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea"))
    .slice(0, 25)
    .map((el) => getAssociatedLabelText(el) ?? "")
    .join("|");
  return labels;
}

function evaluateApplicationFlow(): void {
  if (!modalHandled) {
    const applyManually = findApplyManuallyButton();
    if (applyManually) {
      modalHandled = true;
      applyManually.click();
      return;
    }
  }

  if (!looksLikeApplicationForm()) return;

  const signature = currentStepSignature();
  if (signature === lastFillSignature) return;
  lastFillSignature = signature;
  void runApplicationFormFill();
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleEvaluate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(evaluateApplicationFlow, 250);
}

evaluateApplicationFlow();
new MutationObserver(scheduleEvaluate).observe(document.body, { childList: true, subtree: true });
