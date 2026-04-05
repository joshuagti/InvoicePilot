import { parseISO, isValid } from "date-fns";

/** Parse ISO date string or common formats; returns null if invalid. */
export function parseDocumentDate(input: string | null | undefined): Date | null {
  if (!input?.trim()) return null;
  const s = input.trim();
  const iso = parseISO(s);
  if (isValid(iso)) return iso;
  const d = new Date(s);
  return isValid(d) ? d : null;
}
