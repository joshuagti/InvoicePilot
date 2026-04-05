import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";
import { writeAudit } from "@/lib/audit/audit";
import { testImapCredentials, type ImapConfig } from "@/lib/email/imap";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().positive().optional(),
  username: z.string().min(1).optional(),
  /** Omit or empty to keep existing password. */
  password: z.string().optional(),
  tls: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

function imapErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Connection failed";
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const patch = parsed.data;
  const existing = await prisma.mailbox.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const connectionFieldsChanged =
    patch.host !== undefined ||
    patch.port !== undefined ||
    patch.username !== undefined ||
    patch.tls !== undefined ||
    (patch.password !== undefined && patch.password.length > 0);

  if (connectionFieldsChanged) {
    const nextHost = patch.host ?? existing.host;
    const nextPort = patch.port ?? existing.port;
    const nextUser = patch.username ?? existing.username;
    const nextTls = patch.tls ?? existing.tls;

    let passwordPlain: string;
    try {
      passwordPlain =
        patch.password !== undefined && patch.password.length > 0
          ? patch.password
          : decryptSecret(existing.passwordEnc);
    } catch {
      return NextResponse.json({ error: "Could not read stored password; set a new password." }, { status: 500 });
    }

    const testConfig: ImapConfig = {
      host: nextHost,
      port: nextPort,
      username: nextUser,
      password: passwordPlain,
      tls: nextTls,
    };

    try {
      await testImapCredentials(testConfig);
    } catch (e) {
      return NextResponse.json(
        { error: "IMAP connection test failed", detail: imapErrorMessage(e) },
        { status: 422 }
      );
    }
  }

  const mb = await prisma.mailbox.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.host !== undefined ? { host: patch.host } : {}),
      ...(patch.port !== undefined ? { port: patch.port } : {}),
      ...(patch.username !== undefined ? { username: patch.username } : {}),
      ...(patch.tls !== undefined ? { tls: patch.tls } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.password !== undefined && patch.password.length > 0
        ? { passwordEnc: encryptSecret(patch.password) }
        : {}),
    },
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

  await writeAudit("Mailbox", mb.id, "mailbox_updated", { host: mb.host, username: mb.username });

  return NextResponse.json({ mailbox: mb });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const existing = await prisma.mailbox.findUnique({
    where: { id },
    include: { _count: { select: { emails: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing._count.emails > 0) {
    await prisma.mailbox.update({
      where: { id },
      data: { isActive: false },
    });
    await writeAudit("Mailbox", id, "mailbox_deactivated", { reason: "has_emails" });
    return NextResponse.json({ ok: true, mode: "deactivated" as const });
  }

  try {
    await prisma.mailbox.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      await prisma.mailbox.update({
        where: { id },
        data: { isActive: false },
      });
      await writeAudit("Mailbox", id, "mailbox_deactivated", { reason: "fk_constraint" });
      return NextResponse.json({ ok: true, mode: "deactivated" as const });
    }
    throw e;
  }

  await writeAudit("Mailbox", id, "mailbox_deleted", {});
  return NextResponse.json({ ok: true, mode: "deleted" as const });
}
