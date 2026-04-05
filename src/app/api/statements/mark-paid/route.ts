import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

const bodySchema = z.object({
  documentId: z.string().min(1),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", detail: parsed.error.flatten() }, { status: 422 });
  }

  const { documentId, note } = parsed.data;

  const existing = await prisma.document.findUnique({ where: { id: documentId } });
  if (!existing) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const paidAt = new Date();
  const updated = await prisma.document.update({
    where: { id: documentId },
    data: {
      paidAt,
      paidNote: note?.trim() ? note.trim() : null,
    },
    include: {
      email: {
        select: {
          id: true,
          subject: true,
          fromEmail: true,
          receivedAt: true,
          sentAt: true,
        },
      },
      supplier: { select: { id: true, name: true, paymentModel: true } },
    },
  });

  await writeAudit("Document", documentId, "marked_paid", {
    paidAt: paidAt.toISOString(),
    hasNote: !!note?.trim(),
  });

  return NextResponse.json({ document: updated });
}
