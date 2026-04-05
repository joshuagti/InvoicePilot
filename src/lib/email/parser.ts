import { simpleParser } from "mailparser";
import type { ParsedMail, AddressObject } from "mailparser";
import { createHash } from "crypto";

export type ParsedEmail = {
  messageIdHeader: string | null;
  fromName: string | null;
  fromEmail: string | null;
  senderDomain: string | null;
  subject: string | null;
  sentAt: Date | null;
  textBody: string | null;
  htmlBody: string | null;
  attachments: Array<{
    filename: string | null;
    contentType: string | null;
    sizeBytes: number | null;
    content: Buffer;
    checksum: string;
  }>;
};

function firstAddress(addr: AddressObject | AddressObject[] | undefined): {
  name: string | null;
  address: string | null;
} {
  if (!addr) return { name: null, address: null };
  const list = Array.isArray(addr) ? addr : [addr];
  const first = list[0];
  if (!first) return { name: null, address: null };
  if ("value" in first && Array.isArray(first.value) && first.value[0]) {
    const v = first.value[0];
    return {
      name: v.name || null,
      address: v.address || null,
    };
  }
  return { name: null, address: null };
}

function domainFromEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

export async function parseRawEmail(raw: Buffer): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(raw);
  const from = firstAddress(parsed.from);
  const fromEmail = from.address?.toLowerCase() ?? null;

  const attachments = (parsed.attachments ?? []).map((a) => {
    const content = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content);
    const checksum = createHash("sha256").update(content).digest("hex");
    return {
      filename: a.filename ?? null,
      contentType: a.contentType ?? null,
      sizeBytes: content.length,
      content,
      checksum,
    };
  });

  return {
    messageIdHeader: parsed.messageId ?? null,
    fromName: from.name,
    fromEmail,
    senderDomain: domainFromEmail(fromEmail),
    subject: parsed.subject ?? null,
    sentAt: parsed.date ?? null,
    textBody: parsed.text ?? null,
    htmlBody: parsed.html ? String(parsed.html) : null,
    attachments,
  };
}
