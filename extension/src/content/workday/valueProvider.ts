import type { ValueProvider } from "./fillEngine";
import type { AutofillData, JdLocation } from "../../lib/types";

function splitFullName(fullName: string | null): { first: string | null; last: string | null } {
  if (!fullName) return { first: null, last: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function formatLocationPreference(loc: JdLocation | null): string | null {
  if (!loc) return null;
  return [loc.city, loc.state, loc.country].filter(Boolean).join(", ") || null;
}

/** Direct profile_fields / resume-contact values are "high" confidence;
 * anything inferred from the cached JD location (rather than the user's own
 * saved data) is "low", since it's a best-guess for a location-preference
 * question rather than a fact the user actually told us about themselves. */
export function buildValueProvider(data: AutofillData): ValueProvider {
  const { first, last } = splitFullName(data.contact?.full_name ?? null);

  return (concept) => {
    switch (concept) {
      case "first_name":
        return data.profileFields.first_name
          ? { value: data.profileFields.first_name, confidence: "high" }
          : first
            ? { value: first, confidence: "high" }
            : null;
      case "last_name":
        return data.profileFields.last_name
          ? { value: data.profileFields.last_name, confidence: "high" }
          : last
            ? { value: last, confidence: "high" }
            : null;
      case "email":
        return data.contact?.email ? { value: data.contact.email, confidence: "high" } : null;
      case "phone":
        return data.profileFields.phone
          ? { value: data.profileFields.phone, confidence: "high" }
          : data.contact?.phone
            ? { value: data.contact.phone, confidence: "high" }
            : null;
      case "address_line1":
        return data.profileFields.address_line1
          ? { value: data.profileFields.address_line1, confidence: "high" }
          : null;
      case "address_line2":
        return data.profileFields.address_line2
          ? { value: data.profileFields.address_line2, confidence: "high" }
          : null;
      case "city":
        return data.profileFields.city
          ? { value: data.profileFields.city, confidence: "high" }
          : data.jdLocation?.city
            ? { value: data.jdLocation.city, confidence: "low" }
            : null;
      case "state":
        return data.profileFields.state
          ? { value: data.profileFields.state, confidence: "high" }
          : data.jdLocation?.state
            ? { value: data.jdLocation.state, confidence: "low" }
            : null;
      case "zip_code":
        return data.profileFields.zip_code ? { value: data.profileFields.zip_code, confidence: "high" } : null;
      case "country":
        return data.profileFields.country
          ? { value: data.profileFields.country, confidence: "high" }
          : data.jdLocation?.country
            ? { value: data.jdLocation.country, confidence: "low" }
            : null;
      case "linkedin_url":
        return data.profileFields.linkedin_url
          ? { value: data.profileFields.linkedin_url, confidence: "high" }
          : data.contact?.linkedin_url
            ? { value: data.contact.linkedin_url, confidence: "high" }
            : null;
      case "portfolio_url":
        return data.profileFields.portfolio_url
          ? { value: data.profileFields.portfolio_url, confidence: "high" }
          : data.contact?.portfolio_url
            ? { value: data.contact.portfolio_url, confidence: "high" }
            : null;
      case "location_preference": {
        // The user's own saved preference wins over a guess derived from the
        // job's location.
        if (data.profileFields.preferred_location)
          return { value: data.profileFields.preferred_location, confidence: "high" };
        const formatted = formatLocationPreference(data.jdLocation);
        return formatted ? { value: formatted, confidence: "low" } : null;
      }
      case "work_authorization":
        return data.commonAnswers.work_authorization
          ? { value: data.commonAnswers.work_authorization, confidence: "high" }
          : null;
      case "sponsorship":
        return data.commonAnswers.sponsorship
          ? { value: data.commonAnswers.sponsorship, confidence: "high" }
          : null;
      case "years_experience":
        return data.profileFields.years_experience
          ? { value: data.profileFields.years_experience, confidence: "high" }
          : null;
      case "desired_salary":
        return data.profileFields.desired_salary
          ? { value: data.profileFields.desired_salary, confidence: "high" }
          : null;
      case "willing_to_relocate":
        return data.profileFields.willing_to_relocate
          ? { value: data.profileFields.willing_to_relocate, confidence: "high" }
          : null;
      case "available_start_date":
        return data.profileFields.available_start_date
          ? { value: data.profileFields.available_start_date, confidence: "high" }
          : null;
      case "phone_device_type":
        // Required dropdown on Workday's My Information step; default to Mobile
        // unless the user saved an override.
        return { value: data.profileFields.phone_device_type || "Mobile", confidence: "high" };
      default:
        return null;
    }
  };
}
