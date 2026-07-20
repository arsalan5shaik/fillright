import type { ScanProgressMessage } from "../../lib/types";
import { isWizardStep, looksLikeApplicationForm, runApplicationFormFill } from "./applicationForm";
import { findApplyButton, findApplyManuallyButton } from "./applyButton";
import { detectJobPosting } from "./detect";
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
// True while a fill pass is in flight. The fill pass takes several seconds
// and mutates the DOM heavily (adds Work Experience/Education panels, fills
// fields, attaches the résumé); those mutations retrigger the MutationObserver.
// Without this mutex a second fill launched on top of the first, which caused
// the résumé to attach 3x and the Websites section to duplicate LinkedIn
// across slots. Never start a fill while one is running.
let filling = false;
// Steps already filled once, keyed by a STABLE id (below). A step is filled
// exactly once - re-running it is what produced the duplicates.
const handledSteps = new Set<string>();

/** A stable id for the current wizard step that does NOT change as the fill
 * pass mutates the page. Workday wraps each apply-flow step in an element
 * whose data-automation-id starts with "applyFlow" (e.g. applyFlowMyExpPage)
 * - that id is constant across a step's own field changes, unlike a
 * field-label fingerprint (whose change mid-fill was exactly what retriggered
 * the pass). Falls back to the step heading + path for tenants without that
 * wrapper. */
function currentStepId(): string {
  const applyFlow = document.querySelector('[data-automation-id^="applyFlow"]');
  if (applyFlow) return applyFlow.getAttribute("data-automation-id") ?? "applyFlow";
  const heading = document.querySelector("h1, h2, h3")?.textContent?.trim() ?? "";
  return `${heading}::${window.location.pathname}`;
}

function evaluateApplicationFlow(): void {
  if (filling) return; // a fill is in flight - never start a second concurrently

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

  const stepId = currentStepId();
  if (handledSteps.has(stepId)) return; // already filled this step once
  handledSteps.add(stepId);
  filling = true;
  void runApplicationFormFill().finally(() => {
    filling = false;
  });
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleEvaluate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(evaluateApplicationFlow, 250);
}

evaluateApplicationFlow();
new MutationObserver(scheduleEvaluate).observe(document.body, { childList: true, subtree: true });
