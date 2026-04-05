import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function writeAudit(
  entityType: string,
  entityId: string,
  action: string,
  payload?: Record<string, unknown>
) {
  await prisma.auditEvent.create({
    data: {
      entityType,
      entityId,
      action,
      payload:
        payload === undefined
          ? undefined
          : (payload as Prisma.InputJsonValue),
    },
  });
}
