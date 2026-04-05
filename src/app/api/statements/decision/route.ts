import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveExplicitRule } from "@/lib/rules/rule-lookup";
import { decideDocumentOutcome } from "@/lib/rules/decision-engine";

/** Explain how count decision was derived for a document (audit/debug). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { email: true, supplier: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rules = doc.supplierId
    ? await prisma.supplierRule.findMany({
        where: { supplierId: doc.supplierId, isActive: true },
      })
    : [];

  const attachmentNames =
    doc.emailId ?
      (
        await prisma.emailAttachment.findMany({
          where: { emailId: doc.emailId },
          select: { filename: true },
        })
      ).map((a) => a.filename ?? "")
    : [];

  const extraction = doc.extractionJson as {
    shouldCount?: string;
    confidence?: number;
    documentType?: string;
  } | null;

  const explicit = resolveExplicitRule(rules, {
    senderDomain: doc.email?.senderDomain ?? null,
    senderEmail: doc.email?.fromEmail ?? null,
    subject: doc.email?.subject ?? null,
    attachmentNames,
    documentType: doc.documentType,
  });

  const aiShouldCount =
    (extraction?.shouldCount as "count" | "do_not_count" | "review_required") ?? "review_required";
  const aiConfidence = extraction?.confidence ?? Number(doc.aiConfidence ?? 0);

  const outcome = decideDocumentOutcome({
    aiShouldCount,
    aiConfidence,
    supplierPaymentModel: (doc.supplier?.paymentModel as "monthly_account" | "pay_per_order" | "mixed" | "unknown") ?? null,
    documentType: doc.documentType,
    explicitRule: explicit ? explicit.shouldCount : null,
  });

  return NextResponse.json({
    documentId: doc.id,
    storedCountDecision: doc.countDecision,
    recomputedOutcome: outcome,
    explicitRule: explicit,
    supplierPaymentModel: doc.supplier?.paymentModel ?? null,
    aiShouldCount,
    aiConfidence,
  });
}
