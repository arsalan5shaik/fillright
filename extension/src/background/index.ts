import type { StoredSession } from "../lib/types";

type BridgeMessage = { type: "SESSION_UPDATE"; session: StoredSession } | { type: "SESSION_CLEARED" };

chrome.runtime.onMessage.addListener((message: BridgeMessage, _sender, sendResponse) => {
  if (message.type === "SESSION_UPDATE") {
    chrome.storage.local.set({ session: message.session }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "SESSION_CLEARED") {
    chrome.storage.local.remove("session").then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
