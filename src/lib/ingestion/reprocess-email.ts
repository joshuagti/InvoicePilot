import { prisma } from "@/lib/db/prisma";
import { buildNormalizedDocumentInput } from "@/lib/email/normalize";
import { hasMinimalContentForAiExtraction, isCandidateEmail } from "@/lib/email/candidate-filter";
import { extractWithRetry } from "@/lib/ai/extract-statement";
import { decideDocumentOutcome, type DecideInput } from "@/lib/rules/decision-engine";
import { resolveExplicitRule } from "@/lib/rules/rule-lookup";
import { parseDocumentDate } from "@/lib/utils/dates";
import { normalizeCurrencyForStorage, toDecimal } from "@/lib/utils/money";
import { writeAudit } from "@/lib/audit/audit";
import { logger } from "@/lib/utils/logger";
import { Prisma } from "@prisma/client";
import {
  ensureSupplierForDomain,
  getKnownSupplierDomains,
  resolveSupplier,
} from "@/lib/ingestion/poll-mail";

export type ReprocessEmailResult =
  | { ok: true; candidate: boolean; gptCalls: number }
  | { ok: false; error: string };

/** Re-run AI extraction and document classification from stored email + attachment text (same inputs as ingestion). */
export async function reprocessEmailWithAi(emailId: string): Promise<ReprocessEmailResult> {
  let gptCalls = 0;

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { attachments: { orderBy: { createdAt: "asc" } } },
  });
  if (!email) {
    return { ok: false, error: "email_not_found" };
  }

  const bodyText = email.textBody ?? email.htmlBody ?? "";
  const normalizedText = buildNormalizedDocumentInput({
    fromEmail: email.fromEmail,
    subject: email.subject,
    sentAt: email.sentAt,
    bodyText,
    attachmentSummaries: email.attachments.map((a) => ({
      filename: a.filename,
      extractedText: a.extractedText,
    })),
  });

  await prisma.email.update({
    where: { id: emailId },
    data: { normalizedText },
  });

  const knownDomains = await getKnownSupplierDomains();
  const attachmentNames = email.attachments.map((a) => a.filename ?? "");
  const candidate = isCandidateEmail({
    subject: email.subject,
    fromEmail: email.fromEmail,
    senderDomain: email.senderDomain,
    bodySnippet: bodyText,
    attachmentNames,
    knownSupplierDomains: knownDomains,
  });

  if (!candidate) {
    await prisma.document.deleteMany({ where: { emailId } });
    await prisma.email.update({
      where: { id: emailId },
      data: { ingestStatus: "processed", processedAt: new Date() },
    });
    await writeAudit("Email", emailId, "reprocess_skipped_non_candidate", {});
    return { ok: true, candidate: false, gptCalls: 0 };
  }

  if (
    !hasMinimalContentForAiExtraction({
      bodyText,
      attachmentSummaries: email.attachments.map((a) => ({ extractedText: a.extractedText })),
    })
  ) {
    await prisma.document.deleteMany({ where: { emailId } });
    await prisma.email.update({
      where: { id: emailId },
      data: { ingestStatus: "processed", processedAt: new Date() },
    });
    await writeAudit("Email", emailId, "reprocess_skipped_insufficient_content", {});
    return { ok: true, candidate: false, gptCalls: 0 };
  }

  const ex = await extractWithRetry(normalizedText);
  gptCalls++;

  const attIds = email.attachments.map((a) => a.id);
  const primaryIdx = email.attachments.length > 0 ? 0 : null;
  const primaryAttachmentId =
    primaryIdx !== null && attIds[primaryIdx] ? attIds[primaryIdx] : null;

  const existing = await prisma.document.findFirst({
    where: { emailId },
    orderBy: { createdAt: "asc" },
  });

  if (!ex.ok) {
    const supplierId = await ensureSupplierForDomain(email.senderDomain, null);
    const base = {
      supplierId,
      primaryAttachmentId,
      documentType: "unknown",
      paymentModelGuess: "unknown",
      countDecision: "do_not_count",
      aiConfidence: null,
      aiReason: `Extraction failed: ${ex.error}`,
      unsureReason: "System could not parse AI output",
      extractionJson: (ex.raw ? { raw: ex.raw } : { error: ex.error }) as Prisma.InputJsonValue,
      reviewState: "auto_classified",
      status: "pending" as const,
    };

    let docId: string;
    if (existing) {
      await prisma.document.update({
        where: { id: existing.id },
        data: {
          ...base,
          paidAt: existing.paidAt,
          paidNote: existing.paidNote,
        },
      });
      docId = existing.id;
    } else {
      const created = await prisma.document.create({
        data: { emailId, ...base },
      });
      docId = created.id;
    }
    await prisma.document.deleteMany({ where: { emailId, id: { not: docId } } });

    await prisma.email.update({
      where: { id: emailId },
      data: { ingestStatus: "processed", processedAt: new Date() },
    });
    await writeAudit("Email", emailId, "reprocess_extraction_failed", { error: ex.error });
    return { ok: true, candidate: true, gptCalls };
  }

  const data = ex.data;
  const supplierId = await ensureSupplierForDomain(email.senderDomain, data.supplierName);
  const supplier = await resolveSupplier(email.senderDomain, data.supplierName);
  const rules = supplier?.rules ?? [];

  const explicit = resolveExplicitRule(rules, {
    senderDomain: email.senderDomain,
    senderEmail: email.fromEmail,
    subject: email.subject,
    attachmentNames,
    documentType: data.documentType,
  });

  const decision = decideDocumentOutcome({
    aiShouldCount: data.shouldCount,
    aiConfidence: data.confidence,
    supplierPaymentModel: (supplier?.paymentModel as DecideInput["supplierPaymentModel"]) ?? null,
    documentType: data.documentType,
    explicitRule: explicit ? explicit.shouldCount : null,
  });

  const needsHumanReview =
    data.documentType !== "unknown" && (decision === "review_required" || data.needsReview);
  const reviewState = needsHumanReview ? "needs_review" : "auto_classified";

  const updatePayload = {
    supplierId,
    primaryAttachmentId,
    documentType: data.documentType,
    paymentModelGuess: data.paymentModelGuess,
    countDecision: decision,
    supplierNameRaw: data.supplierName,
    accountReference: data.accountReference,
    documentDate: parseDocumentDate(data.documentDate),
    dueDate: parseDocumentDate(data.dueDate),
    currency: normalizeCurrencyForStorage(data.currency),
    amountDue: toDecimal(data.amountDue ?? undefined),
    aiConfidence: new Prisma.Decimal(data.confidence.toFixed(3)),
    aiReason: data.reason,
    unsureReason: data.unsureReason,
    extractionJson: data as unknown as Prisma.InputJsonValue,
    reviewState,
    status: "pending" as const,
  };

  let docId: string;
  if (existing) {
    await prisma.document.update({
      where: { id: existing.id },
      data: {
        ...updatePayload,
        paidAt: existing.paidAt,
        paidNote: existing.paidNote,
      },
    });
    docId = existing.id;
  } else {
    const created = await prisma.document.create({
      data: { emailId, ...updatePayload },
    });
    docId = created.id;
  }
  await prisma.document.deleteMany({ where: { emailId, id: { not: docId } } });

  await prisma.email.update({
    where: { id: emailId },
    data: { ingestStatus: "processed", processedAt: new Date() },
  });

  await writeAudit("Email", emailId, "reprocess_complete", {
    documentType: data.documentType,
    countDecision: decision,
  });

  logger.info({ emailId, decision, documentType: data.documentType }, "reprocess complete");
  return { ok: true, candidate: true, gptCalls };
}

export type ReprocessBatchMetrics = {
  emails: number;
  gptCalls: number;
  errors: number;
};

/** Re-run AI on stored emails (newest first). Each email uses one GPT call when it is a candidate. */
export async function reprocessEmailsBatch(options?: {
  limit?: number;
}): Promise<ReprocessBatchMetrics> {
  const limit = options?.limit ?? 100;
  const metrics: ReprocessBatchMetrics = { emails: 0, gptCalls: 0, errors: 0 };

  const rows = await prisma.email.findMany({
    where: {
      OR: [{ textBody: { not: null } }, { htmlBody: { not: null } }, { hasAttachments: true }],
    },
    select: { id: true },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });

  for (const row of rows) {
    metrics.emails++;
    const r = await reprocessEmailWithAi(row.id);
    if (!r.ok) {
      metrics.errors++;
      continue;
    }
    metrics.gptCalls += r.gptCalls;
  }

  return metrics;
}
