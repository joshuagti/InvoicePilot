import type { SupplierRule } from "@prisma/client";
import { matchesPattern } from "@/lib/rules/pattern-matcher";

function ruleSpecificity(r: SupplierRule): number {
  switch (r.ruleType) {
    case "document_type_rule":
      return 50;
    case "attachment_rule":
      return 40;
    case "subject_rule":
      return 30;
    case "sender_rule":
      return 20;
    case "supplier_default":
      return 10;
    default:
      return 0;
  }
}

export type RuleContext = {
  senderDomain: string | null;
  senderEmail: string | null;
  subject: string | null;
  attachmentNames: string[];
  documentType: string | null;
};

/**
 * Returns explicit shouldCount from user-confirmed rules, or null if no decisive rule.
 * Priority: user-confirmed rules first, then active learned rules with shouldCount set.
 */
export function resolveExplicitRule(
  rules: SupplierRule[],
  ctx: RuleContext
): { shouldCount: boolean; ruleId: string } | null {
  const sorted = [...rules].filter((r) => r.isActive).sort((a, b) => {
    if (a.isUserConfirmed !== b.isUserConfirmed) return a.isUserConfirmed ? -1 : 1;
    const spec = ruleSpecificity(b) - ruleSpecificity(a);
    if (spec !== 0) return spec;
    const ac = Number(a.confidenceScore ?? 0);
    const bc = Number(b.confidenceScore ?? 0);
    return bc - ac;
  });

  for (const r of sorted) {
    if (r.shouldCount === null || r.shouldCount === undefined) continue;

    if (r.ruleType === "supplier_default" && r.isUserConfirmed) {
      return { shouldCount: r.shouldCount, ruleId: r.id };
    }

    if (r.ruleType === "sender_rule") {
      if (r.senderEmail && ctx.senderEmail?.toLowerCase() === r.senderEmail.toLowerCase()) {
        return { shouldCount: r.shouldCount, ruleId: r.id };
      }
      if (r.senderDomain && ctx.senderDomain?.toLowerCase() === r.senderDomain.toLowerCase()) {
        return { shouldCount: r.shouldCount, ruleId: r.id };
      }
    }

    if (r.ruleType === "subject_rule" && r.subjectPattern && matchesPattern(ctx.subject, r.subjectPattern)) {
      if (!r.documentType || r.documentType === ctx.documentType) {
        return { shouldCount: r.shouldCount, ruleId: r.id };
      }
    }

    if (r.ruleType === "attachment_rule" && r.attachmentPattern) {
      const hit = ctx.attachmentNames.some((n) => matchesPattern(n, r.attachmentPattern));
      if (hit && (!r.documentType || r.documentType === ctx.documentType)) {
        return { shouldCount: r.shouldCount, ruleId: r.id };
      }
    }

    if (r.ruleType === "document_type_rule" && r.documentType && r.documentType === ctx.documentType) {
      return { shouldCount: r.shouldCount, ruleId: r.id };
    }
  }

  return null;
}
