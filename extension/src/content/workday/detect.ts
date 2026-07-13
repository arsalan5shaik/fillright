import type { ScannedJobPosting } from "../../lib/types";

interface JobPostingJsonLd {
  "@type"?: string;
  title?: string;
  description?: string;
  identifier?: { value?: string };
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } };
}

/** Workday renders a schema.org JobPosting JSON-LD block server-side (for
 * SEO/social sharing) on every job posting page, before the SPA hydrates -
 * verified against a real usbank.wd1.myworkdayjobs.com posting. That makes
 * it a far more reliable source for title/description/company/req-id than
 * scraping data-automation-id elements, which only exist once Workday's
 * React app has rendered and could vary by version. */
function findJobPostingJsonLd(): JobPostingJsonLd | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    if (!script.textContent) continue;
    try {
      const data = JSON.parse(script.textContent) as JobPostingJsonLd;
      if (data["@type"] === "JobPosting") return data;
    } catch {
      continue;
    }
  }
  return null;
}

function extractRequisitionIdFromUrl(url: string): string | null {
  const match = url.match(/_([A-Za-z0-9-]+)$/);
  return match ? match[1] : null;
}

/** Workday sometimes prefixes hiringOrganization.name with an internal
 * legal-entity code, e.g. "300 U.S. Bank National Association". */
function cleanCompanyName(rawName: string): string {
  return rawName.replace(/^\d+\s+/, "").trim();
}

/** The JSON-LD's jobLocation is a separate structured field from
 * description - real postings often don't restate the location in the JD
 * body text at all, so the JD-analysis LLM call would have nothing to work
 * with unless we surface it explicitly (verified: a real US Bank posting's
 * description never mentions "Earth City, MO" even though jobLocation has
 * it). Prepending it as an explicit line beats hoping the model infers it
 * from prose that may not exist. */
function formatLocationLine(jobPosting: JobPostingJsonLd): string | null {
  const address = jobPosting.jobLocation?.address;
  if (!address) return null;
  const parts = [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean);
  return parts.length > 0 ? `Job Location: ${parts.join(", ")}` : null;
}

export function detectJobPosting(): ScannedJobPosting | null {
  const jobPosting = findJobPostingJsonLd();
  if (!jobPosting || !jobPosting.description) return null;

  const jobUrl = window.location.href.split("?")[0];
  const company = jobPosting.hiringOrganization?.name
    ? cleanCompanyName(jobPosting.hiringOrganization.name)
    : window.location.hostname.split(".")[0];
  const locationLine = formatLocationLine(jobPosting);

  return {
    company,
    requisitionId: jobPosting.identifier?.value ?? extractRequisitionIdFromUrl(jobUrl),
    jobTitle: jobPosting.title ?? document.title,
    jobUrl,
    jdText: locationLine ? `${locationLine}\n\n${jobPosting.description}` : jobPosting.description,
  };
}
