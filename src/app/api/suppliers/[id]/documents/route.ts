import { NextResponse } from "next/server";
import { format } from "date-fns";
import { prisma } from "@/lib/db/prisma";

type RouteParams = { params: Promise<{ id: string }> };

function monthKey(d: Date): string {
  return format(d, "yyyy-MM");
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: supplierId } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, paymentModel: true },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const documents = await prisma.document.findMany({
    where: {
      supplierId,
      countDecision: "count",
      amountDue: { not: null },
    },
    orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
    include: {
      email: {
        select: {
          id: true,
          subject: true,
          receivedAt: true,
        },
      },
    },
  });

  const monthlyTotals: { month: string; total: string; currency: string | null }[] = [];
  const monthMap = new Map<string, { sum: number; currency: string | null }>();

  for (const d of documents) {
    const dt = d.documentDate ?? d.email.receivedAt;
    if (!dt || d.amountDue == null) continue;
    const m = monthKey(dt);
    const ccy = d.currency ?? "";
    const key = `${m}|${ccy}`;
    const n = Number(d.amountDue);
    const cur = monthMap.get(key);
    const currency = d.currency ?? null;
    if (cur) {
      cur.sum += n;
    } else {
      monthMap.set(key, { sum: n, currency });
    }
  }

  const sortedKeys = [...monthMap.keys()].sort((a, b) => b.localeCompare(a));
  for (const key of sortedKeys) {
    const v = monthMap.get(key)!;
    const month = key.split("|")[0]!;
    monthlyTotals.push({
      month,
      total: v.sum.toFixed(2),
      currency: v.currency,
    });
  }

  return NextResponse.json({
    supplier,
    documents,
    monthlyTotals,
  });
}
