export type DecideInput = {
  aiShouldCount: "count" | "do_not_count" | "review_required";
  aiConfidence: number;
  supplierPaymentModel?: "monthly_account" | "pay_per_order" | "mixed" | "unknown" | null;
  documentType?: string | null;
  explicitRule?: boolean | null;
};

export function decideDocumentOutcome(input: DecideInput): "count" | "do_not_count" | "review_required" {
  if (input.explicitRule === true) return "count";
  if (input.explicitRule === false) return "do_not_count";

  if (input.documentType === "unknown") {
    return "do_not_count";
  }

  if (
    input.supplierPaymentModel === "monthly_account" &&
    input.documentType === "monthly_statement" &&
    input.aiConfidence >= 0.9
  ) {
    return "count";
  }

  if (
    input.supplierPaymentModel === "pay_per_order" &&
    input.documentType === "invoice" &&
    input.aiConfidence >= 0.9
  ) {
    return "do_not_count";
  }

  if (input.aiConfidence >= 0.95) {
    return input.aiShouldCount;
  }

  return "review_required";
}
