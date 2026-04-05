import { logger } from "@/lib/utils/logger";

/** Extract text from PDF buffer (text-based PDFs only). */
export async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    const text = data.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch (e) {
    logger.warn({ err: e }, "pdf extraction failed");
    return null;
  }
}

export function shouldTryPdfExtract(contentType: string | null, filename: string | null): boolean {
  if (contentType?.includes("pdf")) return true;
  const f = filename?.toLowerCase() ?? "";
  return f.endsWith(".pdf");
}
