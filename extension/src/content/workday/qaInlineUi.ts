export interface AnswerPanelOptions {
  sourceLabel: string;
  showSaveToggle: boolean;
  initialChecked: boolean;
  onToggle: (checked: boolean) => void;
}

/** Injected right after the field itself, so the user sees exactly where an
 * AI-generated (or reused) answer came from and gets a one-click way to opt
 * out of saving it - the field stays a normal, directly-editable input, so
 * "review/edit" is just editing the field like any other autofilled one. */
export function injectAnswerPanel(anchorEl: HTMLElement, options: AnswerPanelOptions): void {
  const panel = document.createElement("div");
  panel.setAttribute("data-fillright-answer-panel", "true");
  panel.style.cssText =
    "font: 11px system-ui, sans-serif; color: #5f4b00; background: #fff8e1; " +
    "border: 1px solid #f9a825; border-radius: 4px; padding: 4px 8px; margin: 2px 0 8px; display: block;";

  const label = document.createElement("span");
  label.textContent = `FillRight: ${options.sourceLabel}`;
  panel.appendChild(label);

  if (options.showSaveToggle) {
    const toggleLabel = document.createElement("label");
    toggleLabel.style.cssText = "margin-left: 8px; cursor: pointer;";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = options.initialChecked;
    checkbox.style.cssText = "vertical-align: middle; margin-right: 4px;";
    checkbox.addEventListener("change", () => options.onToggle(checkbox.checked));
    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(document.createTextNode("Save this answer for future applications"));
    panel.appendChild(toggleLabel);
  }

  anchorEl.insertAdjacentElement("afterend", panel);
}
