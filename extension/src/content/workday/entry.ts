import type { ScanProgressMessage } from "../../lib/types";
import { looksLikeApplicationForm, runApplicationFormFill } from "./applicationForm";
import { detectJobPosting } from "./detect";
import { showProgress, showStartButton, showStatus } from "./statusUi";

const posting = detectJobPosting();

if (posting) {
  chrome.runtime.onMessage.addListener((message: ScanProgressMessage) => {
    if (message.type === "SCAN_PROGRESS") {
      showProgress(message.status, message.percent);
    }
  });

  showStartButton(() => {
    showProgress("Starting...", 5);
    chrome.runtime.sendMessage({ type: "SCAN_JOB_POSTING", posting }, () => {
      if (chrome.runtime.lastError) {
        showStatus(`Error: ${chrome.runtime.lastError.message}`);
      }
    });
  });
} else if (looksLikeApplicationForm()) {
  runApplicationFormFill();
}
