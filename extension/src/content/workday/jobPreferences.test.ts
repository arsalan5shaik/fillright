import { describe, expect, it } from "vitest";

import type { AutofillData } from "../../lib/types";
import { matchFieldConcept } from "./fieldMap";
import { buildValueProvider } from "./valueProvider";

function autofillData(profileFields: Record<string, string>): AutofillData {
  return {
    profileFields,
    contact: null,
    commonAnswers: {},
    jdLocation: null,
    jdKeywords: [],
    resumeSkills: [],
    workExperience: [],
    education: [],
  };
}

describe("job-preference field concepts", () => {
  it("matches common job-preference labels to their concepts", () => {
    expect(matchFieldConcept(null, "Years of experience")?.concept).toBe("years_experience");
    expect(matchFieldConcept(null, "Desired Salary")?.concept).toBe("desired_salary");
    expect(matchFieldConcept(null, "Are you willing to relocate?")?.concept).toBe("willing_to_relocate");
    expect(matchFieldConcept(null, "Earliest start date")?.concept).toBe("available_start_date");
  });

  it("resolves preference concepts from saved profile fields", () => {
    const getValue = buildValueProvider(
      autofillData({
        years_experience: "6",
        desired_salary: "140000",
        willing_to_relocate: "Yes",
        available_start_date: "2 weeks",
        preferred_location: "Austin, TX",
      }),
    );

    expect(getValue("years_experience")).toEqual({ value: "6", confidence: "high" });
    expect(getValue("desired_salary")).toEqual({ value: "140000", confidence: "high" });
    expect(getValue("willing_to_relocate")).toEqual({ value: "Yes", confidence: "high" });
    expect(getValue("available_start_date")).toEqual({ value: "2 weeks", confidence: "high" });
  });

  it("prefers the saved location over the job's location for location_preference", () => {
    const data = autofillData({ preferred_location: "Remote" });
    data.jdLocation = { city: "Frisco", state: "Texas", country: "USA" };
    expect(buildValueProvider(data)("location_preference")).toEqual({ value: "Remote", confidence: "high" });

    const noPref = autofillData({});
    noPref.jdLocation = { city: "Frisco", state: "Texas", country: null };
    expect(buildValueProvider(noPref)("location_preference")).toEqual({
      value: "Frisco, Texas",
      confidence: "low",
    });
  });

  it("returns null for a preference the user hasn't filled in", () => {
    const getValue = buildValueProvider(autofillData({}));
    expect(getValue("years_experience")).toBeNull();
    expect(getValue("desired_salary")).toBeNull();
  });
});
