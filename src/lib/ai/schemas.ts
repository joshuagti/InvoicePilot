import { z } from "zod";

/** Model often returns 0–100; we store 0–1 everywhere. */
function normalizeConfidence(val: unknown): unknown {
  if (typeof val !== "number" || Number.isNaN(val)) return val;
  if (val > 1) return Math.min(1, val / 100);
  return val;
}

const confidenceField = z.preprocess(normalizeConfidence, z.number().min(0).max(1));

export const ExtractionSchema = z.object({
  supplierName: z.string().nullable(),
  documentType: z.enum([
    "monthly_statement",
    "invoice",
    "credit_note",
    "order_confirmation",
    "delivery_note",
    "remittance",
    "unknown",
  ]),
  paymentModelGuess: z.enum(["monthly_account", "pay_per_order", "mixed", "unknown"]),
  shouldCount: z.enum(["count", "do_not_count", "review_required"]),
  accountReference: z.string().nullable(),
  documentDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  amountDue: z.number().nullable(),
  currency: z.string().nullable(),
  confidence: confidenceField,
  reason: z.string(),
  unsureReason: z.string().nullable(),
  needsReview: z.boolean(),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
