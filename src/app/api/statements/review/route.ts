import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { recordConfirmationStreak } from "@/lib/rules/learning-engine";
import { Prisma } from "@prisma/client";

const ReviewBodySchema = z.object({
  documentId: z.string(),
  action: z.enum(["count", "do_not_count", "ignore", "mark_reviewed"]),
  decisionScope: z.enum(["email_only", "pattern_rule", "supplier_rule"]).default("email_only"),
  setPaymentModel: z.enum(["monthly_account", "pay_per_order", "mixed", "unknown"]).optional(),
  neverCountInvoices: z.boolean().optional(),
  alwaysCountMonthlyStatements: z.boolean().optional(),
  patternSubjectContains: z.string().optional(),
  userNote: z.string().optional(),
});

/**
 * Review queue: documents that need a human decision.
 * Inclusion: countDecision is review_required OR reviewState is needs_review, and status is not ignored.
 * documentType "unknown" is excluded (not actionable; AI could not classify).
 * amountDue is not used for filtering — items with no extracted amount still appear (UI shows "—").
 */
export async function GET() {
  const docs = await prisma.document.findMany({
    where: {
      AND: [
        {
          OR: [{ countDecision: "review_required" }, { reviewState: "needs_review" }],
        },
        { NOT: { status: "ignored" } },
        { NOT: { documentType: "unknown" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      email: true,
      supplier: true,
      primaryAttachment: true,
    },
  });

  const withAttachments = await Promise.all(
    docs.map(async (d) => {
      const attachments = await prisma.emailAttachment.findMany({
        where: { emailId: d.emailId },
        select: { id: true, filename: true, contentType: true, extractedText: true },
      });
      return { ...d, attachments };
    })
  );

  return NextResponse.json({ documents: withAttachments });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = ReviewBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    documentId,
    action,
    decisionScope,
    setPaymentModel,
    neverCountInvoices,
    alwaysCountMonthlyStatements,
    patternSubjectContains,
    userNote,
  } = parsed.data;

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { email: true, supplier: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  let countDecision = doc.countDecision;
  let status = doc.status;
  const reviewState = "confirmed";

  if (action === "count") {
    countDecision = "count";
    status = "reviewed";
  } else if (action === "do_not_count") {
    countDecision = "do_not_count";
    status = "reviewed";
  } else if (action === "ignore") {
    status = "ignored";
  } else if (action === "mark_reviewed") {
    status = "reviewed";
  }

  const predictedCount =
    doc.countDecision === "count"
      ? true
      : doc.countDecision === "do_not_count"
        ? false
        : null;

  await prisma.document.update({
    where: { id: documentId },
    data: {
      countDecision,
      status,
      reviewState,
    },
  });

  const supplierId = doc.supplierId;

  if (setPaymentModel && supplierId) {
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { paymentModel: setPaymentModel },
    });
    await writeAudit("Supplier", supplierId, "payment_model_set", { setPaymentModel });
  }

  if (supplierId && (neverCountInvoices || alwaysCountMonthlyStatements)) {
    if (neverCountInvoices) {
      await prisma.supplier.update({
        where: { id: supplierId },
        data: { countInvoicesByDefault: false },
      });
      await prisma.supplierRule.create({
        data: {
          supplierId,
          ruleType: "document_type_rule",
          documentType: "invoice",
          shouldCount: false,
          isUserConfirmed: true,
          learnedFromCount: 1,
          confidenceScore: new Prisma.Decimal("0.95"),
        },
      });
    }
    if (alwaysCountMonthlyStatements) {
      await prisma.supplier.update({
        where: { id: supplierId },
        data: { countStatementsByDefault: true },
      });
      await prisma.supplierRule.create({
        data: {
          supplierId,
          ruleType: "document_type_rule",
          documentType: "monthly_statement",
          shouldCount: true,
          isUserConfirmed: true,
          learnedFromCount: 1,
          confidenceScore: new Prisma.Decimal("0.95"),
        },
      });
    }
  }

  if (supplierId && decisionScope === "supplier_rule" && (action === "count" || action === "do_not_count")) {
    await prisma.supplierRule.create({
      data: {
        supplierId,
        ruleType: "supplier_default",
        shouldCount: action === "count",
        isUserConfirmed: true,
        learnedFromCount: 1,
        confidenceScore: new Prisma.Decimal("0.9"),
      },
    });
    await writeAudit("Supplier", supplierId, "supplier_rule_created", { shouldCount: action === "count" });
  }

  if (
    supplierId &&
    decisionScope === "pattern_rule" &&
    doc.email &&
    (action === "count" || action === "do_not_count")
  ) {
    const subjectPat =
      patternSubjectContains?.trim() ||
      (doc.email.subject ? doc.email.subject.slice(0, 80) : undefined);
    await prisma.supplierRule.create({
      data: {
        supplierId,
        ruleType: "subject_rule",
        subjectPattern: subjectPat,
        documentType: doc.documentType ?? undefined,
        shouldCount: action === "count" ? true : action === "do_not_count" ? false : null,
        senderDomain: doc.email.senderDomain ?? undefined,
        isUserConfirmed: true,
        learnedFromCount: 1,
        confidenceScore: new Prisma.Decimal("0.85"),
      },
    });
    await writeAudit("Supplier", supplierId, "pattern_rule_created", { subjectPat });
  }

  const finalCountBool = action === "count" ? true : action === "do_not_count" ? false : null;

  await prisma.reviewDecision.create({
    data: {
      documentId,
      supplierId,
      predictedType: doc.documentType,
      predictedCount,
      finalType: doc.documentType,
      finalCount: finalCountBool,
      finalPaymentModel: setPaymentModel ?? doc.supplier?.paymentModel ?? undefined,
      decisionScope,
      userNote: userNote ?? undefined,
    },
  });

  await writeAudit("Document", documentId, "review_decision", {
    action,
    decisionScope,
    countDecision,
    status,
  });

  let suggestion: { suggestRule: boolean; message: string | null } | null = null;
  if (supplierId && (action === "count" || action === "do_not_count")) {
    suggestion = await recordConfirmationStreak({
      supplierId,
      documentType: doc.documentType,
      outcome: action === "count" ? "count" : "do_not_count",
    });
  }

  return NextResponse.json({ ok: true, suggestion });
}
