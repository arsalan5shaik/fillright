export type FieldConcept =
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "address_line1"
  | "address_line2"
  | "city"
  | "state"
  | "zip_code"
  | "country"
  | "linkedin_url"
  | "portfolio_url"
  | "location_preference"
  | "work_authorization"
  | "sponsorship";

interface FieldConceptDef {
  concept: FieldConcept;
  // Substrings matched case-insensitively against data-automation-id. These
  // are best-effort, based on documented Workday component-naming
  // conventions, not verified against a live application wizard (see
  // Milestone 13 notes) - treated as a high-confidence signal when they DO
  // hit, but the label-keyword fallback is what carries most pages.
  automationIdHints: string[];
  // Keywords matched case-insensitively against the field's associated
  // label/aria-label text - the primary, more portable matching path.
  labelKeywords: string[];
}

export const FIELD_CONCEPTS: FieldConceptDef[] = [
  { concept: "first_name", automationIdHints: ["legalname_firstname", "firstname"], labelKeywords: ["first name", "given name"] },
  { concept: "last_name", automationIdHints: ["legalname_lastname", "lastname"], labelKeywords: ["last name", "family name", "surname"] },
  { concept: "email", automationIdHints: ["email"], labelKeywords: ["email"] },
  { concept: "phone", automationIdHints: ["phone-number", "phonenumber"], labelKeywords: ["phone"] },
  {
    concept: "address_line1",
    automationIdHints: ["addressline1", "addresssection_addressline1"],
    labelKeywords: ["address line 1", "street address"],
  },
  { concept: "address_line2", automationIdHints: ["addressline2"], labelKeywords: ["address line 2", "apt", "suite", "unit"] },
  { concept: "city", automationIdHints: ["addresssection_city", "municipality"], labelKeywords: ["city"] },
  {
    concept: "state",
    automationIdHints: ["addresssection_region", "countryregion"],
    labelKeywords: ["state", "province", "region"],
  },
  { concept: "zip_code", automationIdHints: ["postalcode"], labelKeywords: ["zip", "postal code"] },
  { concept: "country", automationIdHints: ["country"], labelKeywords: ["country"] },
  { concept: "linkedin_url", automationIdHints: ["linkedin"], labelKeywords: ["linkedin"] },
  { concept: "portfolio_url", automationIdHints: ["website", "portfolio"], labelKeywords: ["website", "portfolio"] },
  {
    concept: "location_preference",
    automationIdHints: ["location"],
    labelKeywords: ["which location", "preferred location", "work location", "location would you"],
  },
  { concept: "work_authorization", automationIdHints: [], labelKeywords: ["authorized to work", "legally authorized"] },
  { concept: "sponsorship", automationIdHints: [], labelKeywords: ["sponsorship", "require a visa", "require visa"] },
];

export interface FieldMatch {
  concept: FieldConcept;
  matchConfidence: "high" | "low";
}

/** automation-id hints are checked first (they're specific enough that a
 * substring hit is a strong signal); label keywords are the fallback and
 * always yield "low" match confidence since free-text label matching is
 * inherently fuzzier, even when the keyword match itself is exact. */
export function matchFieldConcept(automationId: string | null, labelText: string | null): FieldMatch | null {
  const normalizedId = (automationId ?? "").toLowerCase();
  const normalizedLabel = (labelText ?? "").toLowerCase();

  if (normalizedId) {
    for (const def of FIELD_CONCEPTS) {
      if (def.automationIdHints.some((hint) => normalizedId.includes(hint))) {
        return { concept: def.concept, matchConfidence: "high" };
      }
    }
  }

  if (normalizedLabel) {
    for (const def of FIELD_CONCEPTS) {
      if (def.labelKeywords.some((keyword) => normalizedLabel.includes(keyword))) {
        return { concept: def.concept, matchConfidence: "low" };
      }
    }
  }

  return null;
}
