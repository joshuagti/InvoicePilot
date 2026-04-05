import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      domains: true,
      rules: { where: { isActive: true } },
      _count: { select: { documents: true, reviewDecisions: true } },
    },
  });

  return NextResponse.json({ suppliers });
}
