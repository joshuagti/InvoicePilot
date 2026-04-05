import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/crypto/secret";
import { writeAudit } from "@/lib/audit/audit";
import { testImapCredentials } from "@/lib/email/imap";

function imapErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Connection failed";
}

export async function GET() {
  const boxes = await prisma.mailbox.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      username: true,
      tls: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ mailboxes: boxes });
}

const PostSchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.coerce.number().int(),
  username: z.string(),
  password: z.string(),
  tls: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, host, port, username, password, tls } = parsed.data;

  try {
    await testImapCredentials({ host, port, username, password, tls });
  } catch (e) {
    return NextResponse.json(
      { error: "IMAP connection test failed", detail: imapErrorMessage(e) },
      { status: 422 }
    );
  }

  const passwordEnc = encryptSecret(password);

  const mb = await prisma.mailbox.create({
    data: { name, host, port, username, passwordEnc, tls },
  });

  await writeAudit("Mailbox", mb.id, "mailbox_created", { host, username });

  return NextResponse.json({
    mailbox: {
      id: mb.id,
      name: mb.name,
      host: mb.host,
      port: mb.port,
      username: mb.username,
      tls: mb.tls,
    },
  });
}
