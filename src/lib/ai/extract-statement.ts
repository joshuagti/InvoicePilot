import OpenAI from "openai";
import { ExtractionSchema, type ExtractionResult } from "@/lib/ai/schemas";
import { logger } from "@/lib/utils/logger";

const SYSTEM_PROMPT = `You are classifying supplier-related business emails and attached statement/invoice text.

Your task is to determine:
1. what type of document this is,
2. whether it appears to relate to a monthly account supplier or a pay-per-order supplier,
3. whether it should count toward a monthly supplier payments list,
4. the key extracted values.

Rules:
- Be conservative.
- If uncertain, choose review_required for shouldCount.
- Do not infer a value unless the text supports it.
- Set unknown values to null.
- Return JSON only, no markdown or code fences.
- Use only the provided content; do not invent fields.
- confidence must be a decimal from 0 to 1 (e.g. 0.95), not 0–100.`;

const USER_TEMPLATE = (normalizedContent: string) =>
  `${normalizedContent}

Respond with a single JSON object matching this shape exactly (types as described):
{
  "supplierName": string | null,
  "documentType": "monthly_statement" | "invoice" | "credit_note" | "order_confirmation" | "delivery_note" | "remittance" | "unknown",
  "paymentModelGuess": "monthly_account" | "pay_per_order" | "mixed" | "unknown",
  "shouldCount": "count" | "do_not_count" | "review_required",
  "accountReference": string | null,
  "documentDate": string | null,
  "dueDate": string | null,
  "amountDue": number | null,
  "currency": string | null,
  "confidence": number,
  "reason": string,
  "unsureReason": string | null,
  "needsReview": boolean
}`;

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  try {
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      return JSON.parse(slice);
    }
    return JSON.parse(trimmed);
  } catch {
    throw new SyntaxError("invalid_json");
  }
}

export async function extractWithOpenAI(
  normalizedContent: string,
  options?: { retryStrict?: boolean }
): Promise<{ ok: true; data: ExtractionResult } | { ok: false; error: string; raw?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY is not configured" };
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  const userContent = options?.retryStrict
    ? `${USER_TEMPLATE(normalizedContent)}\n\nIMPORTANT: Output valid JSON only. No prose before or after.`
    : USER_TEMPLATE(normalizedContent);

  try {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "";
    const parsed = parseJsonLoose(raw);
    const data = ExtractionSchema.safeParse(parsed);
    if (!data.success) {
      logger.warn({ issues: data.error.flatten(), raw }, "extraction schema validation failed");
      return { ok: false, error: "invalid_model_output", raw };
    }
    return { ok: true, data: data.data };
  } catch (e) {
    logger.error({ err: e }, "OpenAI extraction failed");
    return { ok: false, error: e instanceof Error ? e.message : "openai_error" };
  }
}

/** Run extraction with one retry on invalid JSON/shape. */
export async function extractWithRetry(
  normalizedContent: string
): Promise<{ ok: true; data: ExtractionResult } | { ok: false; error: string; raw?: string }> {
  const first = await extractWithOpenAI(normalizedContent);
  if (first.ok) return first;
  if (first.error === "invalid_model_output") {
    return extractWithOpenAI(normalizedContent, { retryStrict: true });
  }
  return first;
}
