import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/utils/logger";

/**
 * After enough consistent confirmations, suggest creating a supplier rule.
 * Does not auto-apply broad rules from a single example.
 */
export async function recordConfirmationStreak(input: {
  supplierId: string;
  documentType: string | null;
  outcome: "count" | "do_not_count";
}): Promise<{ suggestRule: boolean; message: string | null }> {
  const { supplierId, documentType, outcome } = input;
  const wantCount = outcome === "count";

  const recent = await prisma.reviewDecision.findMany({
    where: {
      supplierId,
      finalCount: wantCount,
      ...(documentType ? { finalType: documentType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const count = recent.length;
  if (count >= 5) {
    logger.info({ supplierId, documentType, outcome, count }, "streak reached for rule suggestion");
    return {
      suggestRule: true,
      message: `You have marked ${count} similar documents. Consider creating a supplier rule.`,
    };
  }
  if (count >= 3) {
    return {
      suggestRule: true,
      message: `You have marked ${count} similar documents. A supplier rule can be created after more confirmations.`,
    };
  }

  return { suggestRule: false, message: null };
}
