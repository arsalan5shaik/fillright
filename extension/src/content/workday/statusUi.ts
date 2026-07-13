const STATUS_ID = "fillright-status-box";

function ensureStatusBox(): HTMLDivElement {
  let box = document.getElementById(STATUS_ID) as HTMLDivElement | null;
  if (!box) {
    box = document.createElement("div");
    box.id = STATUS_ID;
    box.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 2147483647;
      background: #111;
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font: 13px system-ui, sans-serif;
      max-width: 280px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(box);
  }
  return box;
}

export function showStatus(text: string): void {
  ensureStatusBox().textContent = `FillRight: ${text}`;
}
