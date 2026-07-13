import type { ScanProgressMessage } from "../../lib/types";
import { looksLikeApplicationForm, runApplicationFormFill } from "./applicationForm";
import { findApplyButton } from "./applyButton";
import { detectJobPosting } from "./detect";
import { showProgress, showStartButton, showStatus } from "./statusUi";

const posting = detectJobPosting();

if (posting) {
  chrome.runtime.onMessage.addListener((message: ScanProgressMessage) => {
    if (message.type === "SCAN_PROGRESS") {
      showProgress(message.status, message.percent);
    }
  });

  // Scanning (JD analysis, resume tailoring, cover letter) starts as soon as
  // a job posting is detected - no click needed. The Start button is a
  // separate action: it drives Workday's own Apply button, which navigates
  // into the application flow that the extension then autofills on its own.
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
} else if (looksLikeApplicationForm()) {
  void runApplicationFormFill();
}
