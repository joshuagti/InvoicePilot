import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto/secret";
import { parseRawEmail } from "@/lib/email/parser";
import { extractPdfText, shouldTryPdfExtract } from "@/lib/email/attachment";
import { buildNormalizedDocumentInput } from "@/lib/email/normalize";
import { hasMinimalContentForAiExtraction, isCandidateEmail } from "@/lib/email/candidate-filter";
import {
  fetchMessagesByUids,
  listRecentUids,
  searchUidsSince,
  withImapClient,
  type ImapConfig,
} from "@/lib/email/imap";
import { subDays } from "date-fns";
import { extractWithRetry } from "@/lib/ai/extract-statement";
import { decideDocumentOutcome, type DecideInput } from "@/lib/rules/decision-engine";
import { resolveExplicitRule } from "@/lib/rules/rule-lookup";
import { parseDocumentDate } from "@/lib/utils/dates";
import { normalizeCurrencyForStorage, toDecimal } from "@/lib/utils/money";
import { writeAudit } from "@/lib/audit/audit";
import { logger } from "@/lib/utils/logger";
import { Prisma } from "@prisma/client";

export type PollMetrics = {
  mailboxes: number;
  emailsPolled: number;
  emailsNew: number;
  candidates: number;
  gptCalls: number;
  autoClassified: number;
  reviewRequired: number;
  skipped: number;
  errors: number;
};

function normalizeSupplierName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function getKnownSupplierDomains(): Promise<Set<string>> {
  const rows = await prisma.supplierDomain.findMany({ select: { domain: true } });
  return new Set(rows.map((r) => r.domain.toLowerCase()));
}

export async function resolveSupplier(
  senderDomain: string | null,
  extractedName: string | null
): Promise<{ id: string; paymentModel: string | null; rules: Awaited<ReturnType<typeof prisma.supplierRule.findMany>> } | null> {
  if (senderDomain) {
    const dom = await prisma.supplierDomain.findFirst({
      where: { domain: senderDomain.toLowerCase() },
      include: { supplier: true },
    });
    if (dom) {
      const rules = await prisma.supplierRule.findMany({
        where: { supplierId: dom.supplierId, isActive: true },
      });
      return {
        id: dom.supplierId,
        paymentModel: dom.supplier.paymentModel,
        rules,
      };
    }
  }
  if (extractedName) {
    const norm = normalizeSupplierName(extractedName);
    const sup = await prisma.supplier.findUnique({
      where: { normalizedName: norm },
    });
    if (sup) {
      const rules = await prisma.supplierRule.findMany({
        where: { supplierId: sup.id, isActive: true },
      });
      return { id: sup.id, paymentModel: sup.paymentModel, rules };
    }
  }
  return null;
}

export async function ensureSupplierForDomain(
  senderDomain: string | null,
  extractedName: string | null
): Promise<string | null> {
  const resolved = await resolveSupplier(senderDomain, extractedName);
  if (resolved) return resolved.id;

  const name = extractedName?.trim() || senderDomain || "Unknown supplier";
  const normalizedName = normalizeSupplierName(name);
  const created = await prisma.supplier.create({
    data: {
      name: name.slice(0, 500),
      normalizedName: normalizedName.slice(0, 500),
      paymentModel: "unknown",
    },
  });
  if (senderDomain) {
    await prisma.supplierDomain.create({
      data: { supplierId: created.id, domain: senderDomain.toLowerCase() },
    });
  }
  await writeAudit("Supplier", created.id, "supplier_created", { senderDomain, extractedName });
  return created.id;
}

/** While initial sync is incomplete, only messages on or after this date are considered. */
const INITIAL_SYNC_LOOKBACK_DAYS = 60;

export async function pollMailboxes(options?: { limitPerMailbox?: number }): Promise<PollMetrics> {
  const limitPerMailbox = options?.limitPerMailbox ?? 50;
  const metrics: PollMetrics = {
    mailboxes: 0,
    emailsPolled: 0,
    emailsNew: 0,
    candidates: 0,
    gptCalls: 0,
    autoClassified: 0,
    reviewRequired: 0,
    skipped: 0,
    errors: 0,
  };

  const mailboxes = await prisma.mailbox.findMany({ where: { isActive: true } });
  metrics.mailboxes = mailboxes.length;
  const knownDomains = await getKnownSupplierDomains();

  for (const mb of mailboxes) {
    let password: string;
    try {
      password = decryptSecret(mb.passwordEnc);
    } catch (e) {
      logger.error({ err: e, mailboxId: mb.id }, "decrypt mailbox password failed");
      metrics.errors++;
      await writeAudit("Mailbox", mb.id, "poll_error", { error: "decrypt_failed" });
      continue;
    }

    const cfg: ImapConfig = {
      host: mb.host,
      port: mb.port,
      username: mb.username,
      password,
      tls: mb.tls,
    };

    try {
      await withImapClient(cfg, async (client) => {
        let uids: number[];

        if (mb.initialSyncCompletedAt == null) {
          const since = subDays(new Date(), INITIAL_SYNC_LOOKBACK_DAYS);
          const inWindow = await searchUidsSince(client, since);
          const existing = await prisma.email.findMany({
            where: { mailboxId: mb.id, imapUid: { in: inWindow.map(String) } },
            select: { imapUid: true },
          });
          const have = new Set(existing.map((e) => e.imapUid));
          const pending = inWindow
            .filter((u) => !have.has(String(u)))
            .sort((a, b) => b - a);
          if (pending.length === 0) {
            await prisma.mailbox.update({
              where: { id: mb.id },
              data: { initialSyncCompletedAt: new Date() },
            });
            return;
          }
          uids = pending.slice(0, limitPerMailbox);
        } else {
          uids = await listRecentUids(client, { limit: limitPerMailbox });
        }

        metrics.emailsPolled += uids.length;

        const existing = await prisma.email.findMany({
          where: { mailboxId: mb.id, imapUid: { in: uids.map(String) } },
          select: { imapUid: true },
        });
        const have = new Set(existing.map((e) => e.imapUid));
        const newUids = uids.filter((u) => !have.has(String(u)));

        if (newUids.length === 0) return;

        const fetched = await fetchMessagesByUids(client, newUids);

        for (const { uid, raw, internalDate } of fetched) {
          metrics.emailsNew++;
          try {
            const parsed = await parseRawEmail(raw);
            const uidStr = String(uid);

            const dup = await prisma.email.findUnique({
              where: { mailboxId_imapUid: { mailboxId: mb.id, imapUid: uidStr } },
            });
            if (dup) {
              metrics.skipped++;
              continue;
            }

            const bodyText = parsed.textBody ?? parsed.htmlBody ?? "";
            const attachmentRows: Array<{
              filename: string | null;
              contentType: string | null;
              sizeBytes: number | null;
              extractedText: string | null;
              checksum: string;
            }> = [];

            for (const a of parsed.attachments) {
              let extractedText: string | null = null;
              if (shouldTryPdfExtract(a.contentType, a.filename)) {
                extractedText = await extractPdfText(a.content);
              }
              attachmentRows.push({
                filename: a.filename,
                contentType: a.contentType,
                sizeBytes: a.sizeBytes,
                extractedText,
                checksum: a.checksum,
              });
            }

            const normalizedText = buildNormalizedDocumentInput({
              fromEmail: parsed.fromEmail,
              subject: parsed.subject,
              sentAt: parsed.sentAt,
              bodyText,
              attachmentSummaries: attachmentRows.map((r) => ({
                filename: r.filename,
                extractedText: r.extractedText,
              })),
            });

            const email = await prisma.email.create({
              data: {
                mailboxId: mb.id,
                messageIdHeader: parsed.messageIdHeader,
                imapUid: uidStr,
                fromName: parsed.fromName,
                fromEmail: parsed.fromEmail,
                senderDomain: parsed.senderDomain,
                subject: parsed.subject,
                sentAt: parsed.sentAt,
                receivedAt: internalDate ?? new Date(),
                textBody: parsed.textBody,
                htmlBody: parsed.htmlBody,
                normalizedText,
                hasAttachments: parsed.attachments.length > 0,
                ingestStatus: "pending",
              },
            });

            const attIds: string[] = [];
            for (let i = 0; i < attachmentRows.length; i++) {
              const r = attachmentRows[i];
              const row = await prisma.emailAttachment.create({
                data: {
                  emailId: email.id,
                  filename: r.filename,
                  contentType: r.contentType,
                  sizeBytes: r.sizeBytes,
                  extractedText: r.extractedText,
                  checksum: r.checksum,
                },
              });
              attIds.push(row.id);
            }

            await writeAudit("Email", email.id, "ingested", { mailboxId: mb.id, imapUid: uidStr });

            const attachmentNames = attachmentRows.map((r) => r.filename ?? "");
            const candidate = isCandidateEmail({
              subject: parsed.subject,
              fromEmail: parsed.fromEmail,
              senderDomain: parsed.senderDomain,
              bodySnippet: bodyText,
              attachmentNames,
              knownSupplierDomains: knownDomains,
            });

            if (!candidate) {
              await prisma.email.update({
                where: { id: email.id },
                data: { ingestStatus: "processed", processedAt: new Date() },
              });
              metrics.skipped++;
              logger.debug({ emailId: email.id }, "skipped non-candidate");
              continue;
            }

            metrics.candidates++;

            if (
              !hasMinimalContentForAiExtraction({
                bodyText: bodyText,
                attachmentSummaries: attachmentRows.map((r) => ({ extractedText: r.extractedText })),
              })
            ) {
              await prisma.email.update({
                where: { id: email.id },
                data: { ingestStatus: "processed", processedAt: new Date() },
              });
              metrics.skipped++;
              logger.debug({ emailId: email.id }, "skipped AI: insufficient body/attachment text");
              continue;
            }

            const gptInput = normalizedText;
            const ex = await extractWithRetry(gptInput);
            metrics.gptCalls++;

            if (!ex.ok) {
              const supplierId = await ensureSupplierForDomain(
                parsed.senderDomain,
                null
              );
              await prisma.document.create({
                data: {
                  emailId: email.id,
                  supplierId,
                  documentType: "unknown",
                  paymentModelGuess: "unknown",
                  countDecision: "do_not_count",
                  aiConfidence: null,
                  aiReason: `Extraction failed: ${ex.error}`,
                  unsureReason: "System could not parse AI output",
                  extractionJson: ex.raw ? { raw: ex.raw } : { error: ex.error },
                  reviewState: "auto_classified",
                  status: "pending",
                },
              });
              await prisma.email.update({
                where: { id: email.id },
                data: { ingestStatus: "processed", processedAt: new Date() },
              });
              metrics.autoClassified++;
              await writeAudit("Email", email.id, "extraction_failed", { error: ex.error });
              continue;
            }

            const data = ex.data;
            const supplierId = await ensureSupplierForDomain(
              parsed.senderDomain,
              data.supplierName
            );

            const supplier = await resolveSupplier(parsed.senderDomain, data.supplierName);
            const rules = supplier?.rules ?? [];

            const primaryIdx =
              parsed.attachments.length > 0 ? 0 : null;
            const primaryAttachmentId =
              primaryIdx !== null && attIds[primaryIdx] ? attIds[primaryIdx] : null;

            const explicit = resolveExplicitRule(rules, {
              senderDomain: parsed.senderDomain,
              senderEmail: parsed.fromEmail,
              subject: parsed.subject,
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
              data.documentType !== "unknown" &&
              (decision === "review_required" || data.needsReview);
            const reviewState = needsHumanReview ? "needs_review" : "auto_classified";

            if (reviewState === "auto_classified") metrics.autoClassified++;
            else metrics.reviewRequired++;

            await prisma.document.create({
              data: {
                emailId: email.id,
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
                status: "pending",
              },
            });

            await prisma.email.update({
              where: { id: email.id },
              data: { ingestStatus: "processed", processedAt: new Date() },
            });

            await writeAudit("Email", email.id, "document_created", {
              documentType: data.documentType,
              countDecision: decision,
            });

            logger.info(
              {
                emailId: email.id,
                decision,
                documentType: data.documentType,
              },
              "ingestion complete"
            );
          } catch (e) {
            metrics.errors++;
            logger.error({ err: e, mailboxId: mb.id, uid }, "message processing failed");
            await writeAudit("Mailbox", mb.id, "message_error", {
              uid,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      });
    } catch (e) {
      metrics.errors++;
      logger.error({ err: e, mailboxId: mb.id }, "mailbox poll failed");
      await writeAudit("Mailbox", mb.id, "poll_error", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logger.info(metrics, "poll complete");
  return metrics;
}
