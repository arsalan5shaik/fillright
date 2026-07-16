import { describe, expect, it } from "vitest";

import { hasPlaceholder, isStructuredField } from "./qaPass";

describe("isStructuredField", () => {
  it("treats a GPA field as structured (must not get a free-text essay)", () => {
    expect(isStructuredField("Overall Result (GPA)")).toBe(true);
    expect(isStructuredField("What is your GPA?")).toBe(true);
  });

  it("treats date/salary/phone/zip fields as structured", () => {
    expect(isStructuredField("Graduation Date")).toBe(true);
    expect(isStructuredField("Desired Salary")).toBe(true);
    expect(isStructuredField("Mobile Phone Number")).toBe(true);
    expect(isStructuredField("Postal Code")).toBe(true);
  });

  it("leaves a genuine open-ended question alone", () => {
    expect(isStructuredField("Why are you interested in this role?")).toBe(false);
    expect(isStructuredField("Describe a challenging project you led.")).toBe(false);
  });
});

describe("hasPlaceholder", () => {
  it("detects fill-in-the-blank brackets", () => {
    expect(hasPlaceholder("My overall GPA is [Insert GPA], reflecting my dedication.")).toBe(true);
    expect(hasPlaceholder("I am excited to apply to [Company].")).toBe(true);
  });

  it("passes a normal answer through", () => {
    expect(hasPlaceholder("I have five years of backend experience in Python.")).toBe(false);
  });
});
