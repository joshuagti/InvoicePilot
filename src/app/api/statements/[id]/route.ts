import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      supplier: true,
      primaryAttachment: {
        select: {
          id: true,
          filename: true,
          contentType: true,
          extractedText: true,
        },
      },
      email: {
        select: {
          id: true,
          subject: true,
          fromName: true,
          fromEmail: true,
          senderDomain: true,
          sentAt: true,
          receivedAt: true,
          textBody: true,
          htmlBody: true,
          normalizedText: true,
          hasAttachments: true,
        },
      },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ document });
}
