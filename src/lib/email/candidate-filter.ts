/**
 * Cheap pre-filter before GPT: likely supplier/finance-related content.
 * Returns false only when confidence is very low (obviously irrelevant).
 * When false, ingestion does not create a Document — those emails never appear on the review queue.
 */
const SUBJECT_KEYWORDS =
  /statement|invoice|inv\.|account|payment|due|balance|credit\s*note|remittance|order\s*confirm|delivery/i;

const ATTACHMENT_KEYWORDS =
  /statement|invoice|inv|credit|remit|delivery|order/i;

export function isCandidateEmail(input: {
  subject: string | null;
  fromEmail: string | null;
  senderDomain: string | null;
  bodySnippet: string;
  attachmentNames: string[];
  knownSupplierDomains: Set<string>;
}): boolean {
  const { subject, senderDomain, bodySnippet, attachmentNames, knownSupplierDomains } = input;

  if (senderDomain && knownSupplierDomains.has(senderDomain)) {
    return true;
  }

  if (subject && SUBJECT_KEYWORDS.test(subject)) {
    return true;
  }

  for (const name of attachmentNames) {
    if (name && ATTACHMENT_KEYWORDS.test(name)) {
      return true;
    }
  }

  if (SUBJECT_KEYWORDS.test(bodySnippet.slice(0, 2000))) {
    return true;
  }

  // Very short marketing-only with no keywords — skip
  if (attachmentNames.length === 0 && bodySnippet.length < 80) {
    return false;
  }

  // Default: still consider for review if has attachments (could be invoice PDF)
  if (attachmentNames.length > 0) {
    return true;
  }

  return false;
}

/**
 * If false, the email is unlikely to yield a useful document classification — skip GPT to save tokens.
 * Requires either a substantive body or meaningful extracted attachment text (e.g. PDF).
 */
export function hasMinimalContentForAiExtraction(input: {
  bodyText: string;
  attachmentSummaries: Array<{ extractedText: string | null }>;
}): boolean {
  const body = input.bodyText.replace(/\s+/g, " ").trim();
  if (body.length >= 80) return true;
  return input.attachmentSummaries.some(
    (a) => (a.extractedText?.replace(/\s+/g, " ").trim().length ?? 0) >= 40
  );
}
