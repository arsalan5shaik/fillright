import { describe, expect, it } from "vitest";

import { matchFieldConcept } from "./fieldMap";

describe("phone field concept matching", () => {
  it("matches the actual phone-number field", () => {
    expect(matchFieldConcept(null, "Phone Number")?.concept).toBe("phone");
    expect(matchFieldConcept("phone-number", null)?.concept).toBe("phone");
    expect(matchFieldConcept(null, "Mobile Phone")?.concept).toBe("phone");
  });

  it("does NOT put the phone number into Phone Extension", () => {
    // Live regression: "Phone Extension" matched the "phone" keyword and got
    // filled with the phone number, duplicating it next to Phone Number.
    expect(matchFieldConcept(null, "Phone Extension")).toBeNull();
  });

  it("does NOT treat Country Phone Code as the phone field", () => {
    // Contains "phone" but is a country-code typeahead, not the number.
    const match = matchFieldConcept(null, "Country Phone Code");
    expect(match?.concept).not.toBe("phone");
  });

  it("routes Phone Device Type to its own concept, never plain phone", () => {
    expect(matchFieldConcept("phone-device-type", null)?.concept).toBe("phone_device_type");
    // Even with no automation-id, the label must not fall back to "phone".
    expect(matchFieldConcept(null, "Phone Device Type")?.concept).toBe("phone_device_type");
  });
});

describe("state field concept matching", () => {
  it("matches a real State/Province address field", () => {
    expect(matchFieldConcept(null, "State")?.concept).toBe("state");
    expect(matchFieldConcept(null, "State/Province")?.concept).toBe("state");
    expect(matchFieldConcept("addresssection_region", null)?.concept).toBe("state");
  });

  it("does NOT treat the verb 'state' as the address state (live: employee-ID got Texas)", () => {
    expect(matchFieldConcept(null, "Please state your previous employee ID number with Rolls-Royce")).toBeNull();
    expect(matchFieldConcept(null, "Please state the reason for leaving")).toBeNull();
  });
});
