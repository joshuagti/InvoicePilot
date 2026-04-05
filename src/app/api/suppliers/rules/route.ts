import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { Prisma } from "@prisma/client";

const BodySchema = z.object({
  id: z.string().optional(),
  supplierId: z.string(),
  ruleType: z.enum([
    "supplier_default",
    "document_type_rule",
    "sender_rule",
    "subject_rule",
    "attachment_rule",
  ]),
  senderDomain: z.string().optional().nullable(),
  senderEmail: z.string().optional().nullable(),
  subjectPattern: z.string().optional().nullable(),
  attachmentPattern: z.string().optional().nullable(),
  documentType: z.string().optional().nullable(),
  shouldCount: z.boolean().optional().nullable(),
  paymentModel: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;

  const existing = d.id
    ? await prisma.supplierRule.findUnique({ where: { id: d.id } })
    : null;

  if (d.id && !existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  if (d.id && existing?.isUserConfirmed) {
    return NextResponse.json(
      { error: "Cannot overwrite user-confirmed rule without review. Disable and create a new rule." },
      { status: 403 }
    );
  }

  if (d.id) {
    const updated = await prisma.supplierRule.update({
      where: { id: d.id },
      data: {
        ruleType: d.ruleType,
        senderDomain: d.senderDomain ?? undefined,
        senderEmail: d.senderEmail ?? undefined,
        subjectPattern: d.subjectPattern ?? undefined,
        attachmentPattern: d.attachmentPattern ?? undefined,
        documentType: d.documentType ?? undefined,
        shouldCount: d.shouldCount ?? undefined,
        paymentModel: d.paymentModel ?? undefined,
        isActive: d.isActive ?? true,
        isUserConfirmed: true,
      },
    });
    await writeAudit("SupplierRule", updated.id, "rule_updated", { supplierId: d.supplierId });
    return NextResponse.json({ rule: updated });
  }

  const created = await prisma.supplierRule.create({
    data: {
      supplierId: d.supplierId,
      ruleType: d.ruleType,
      senderDomain: d.senderDomain ?? undefined,
      senderEmail: d.senderEmail ?? undefined,
      subjectPattern: d.subjectPattern ?? undefined,
      attachmentPattern: d.attachmentPattern ?? undefined,
      documentType: d.documentType ?? undefined,
      shouldCount: d.shouldCount ?? undefined,
      paymentModel: d.paymentModel ?? undefined,
      isUserConfirmed: true,
      confidenceScore: new Prisma.Decimal("0.9"),
    },
  });

  await writeAudit("SupplierRule", created.id, "rule_created", { supplierId: d.supplierId });
  return NextResponse.json({ rule: created });
}
