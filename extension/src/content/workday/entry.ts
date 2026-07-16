import type { ScanProgressMessage } from "../../lib/types";
import { isWizardStep, looksLikeApplicationForm, runApplicationFormFill } from "./applicationForm";
import { findApplyButton, findApplyManuallyButton } from "./applyButton";
import { detectJobPosting } from "./detect";
import { getAssociatedLabelText } from "./formUtils";
import { showProgress, showStartButton, showStatus } from "./statusUi";

const posting = detectJobPosting();

// Only a true job-posting page (the ad itself) shows Start + kicks off the
// background scan. A wizard step must NOT - the JobPosting JSON-LD persists
// through Workday's SPA so detectJobPosting() stays truthy inside the flow
// too, which is exactly what used to make the Start button wrongly reappear
// mid-wizard and block auto-fill.
if (posting && !isWizardStep()) {
  chrome.runtime.onMessage.addListener((message: ScanProgressMessage) => {
    if (message.type === "SCAN_PROGRESS") {
      showProgress(message.status, message.percent);
    }
  });

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
 * routed and may never trigger a fresh page load. This content script has to
 * keep re-checking the DOM itself on every render, both to click through the
 * modal and to auto-fill each new step, rather than relying on being
 * re-injected per step. Gated on isWizardStep() (not the old `started`
 * flag): once we're inside the apply flow, every step fills automatically,
 * no Start re-click needed - which was the core "doesn't re-fill on the next
 * page" complaint. */
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
  // Modal handling runs even before we're "inside" the flow, since the
  // "Start Your Application" modal appears on the posting page right after
  // Apply is clicked, before the wizard wrapper renders.
  if (!modalHandled) {
    const applyManually = findApplyManuallyButton();
    if (applyManually) {
      modalHandled = true;
      applyManually.click();
      return;
    }
  }

  // Auto-fill only inside the apply flow - never on the job-posting page
  // (whose incidental fields must not be touched). looksLikeApplicationForm()
  // is a secondary guard against firing on an empty/transitional render.
  if (!isWizardStep() || !looksLikeApplicationForm()) return;

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
