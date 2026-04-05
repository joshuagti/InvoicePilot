import { formatISO } from "date-fns";

/** Build compact curated payload for GPT (not raw MIME). */
export function buildNormalizedDocumentInput(input: {
  fromEmail: string | null;
  subject: string | null;
  sentAt: Date | null;
  bodyText: string;
  attachmentSummaries: Array<{ filename: string | null; extractedText: string | null }>;
}): string {
  const sent =
    input.sentAt != null ? formatISO(input.sentAt) : "unknown";
  const lines: string[] = [
    `From: ${input.fromEmail ?? "unknown"}`,
    `Subject: ${input.subject ?? "(no subject)"}`,
    `Sent At: ${sent}`,
    "",
    "Email Body:",
    truncate(input.bodyText || "(empty)", 8000),
    "",
    "Attachments:",
  ];

  for (const a of input.attachmentSummaries) {
    lines.push(`- ${a.filename ?? "unnamed"}`);
    if (a.extractedText) {
      lines.push("Attachment Extracted Text:");
      lines.push(truncate(a.extractedText, 12000));
    }
  }

  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n... [truncated]";
}
