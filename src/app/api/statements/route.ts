import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const countDecision = searchParams.get("countDecision");
  const supplierId = searchParams.get("supplierId");
  const unpaid = searchParams.get("unpaid") === "true";
  const sort = searchParams.get("sort");
  const take = Math.min(Number(searchParams.get("limit") ?? "50") || 50, 200);

  const where: Prisma.DocumentWhereInput = {};
  if (status) where.status = status;
  if (countDecision) where.countDecision = countDecision;
  if (supplierId) where.supplierId = supplierId;
  if (unpaid) {
    where.paidAt = null;
    where.amountDue = { not: null };
    where.supplierId = { not: null };
  }

  let orderBy: Prisma.DocumentOrderByWithRelationInput | Prisma.DocumentOrderByWithRelationInput[] =
    { createdAt: "desc" };
  if (sort === "dueDate") {
    orderBy = [{ dueDate: "asc" }, { createdAt: "desc" }];
  }

  const rows = await prisma.document.findMany({
    where,
    take,
    orderBy,
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

  return NextResponse.json({ documents: rows });
}
