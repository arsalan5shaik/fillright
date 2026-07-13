import type { ScanProgressMessage } from "../../lib/types";
import { looksLikeApplicationForm, runApplicationFormFill } from "./applicationForm";
import { detectJobPosting } from "./detect";
import { showStatus } from "./statusUi";

const posting = detectJobPosting();

if (posting) {
  showStatus("Scanning job description...");

  chrome.runtime.sendMessage({ type: "SCAN_JOB_POSTING", posting }, () => {
    if (chrome.runtime.lastError) {
      showStatus(`Error: ${chrome.runtime.lastError.message}`);
    }
  });

  chrome.runtime.onMessage.addListener((message: ScanProgressMessage) => {
    if (message.type === "SCAN_PROGRESS") {
      showStatus(message.status);
    }
  });
} else if (looksLikeApplicationForm()) {
  runApplicationFormFill();
}
