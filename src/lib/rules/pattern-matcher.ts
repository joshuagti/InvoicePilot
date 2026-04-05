export function matchesPattern(
  haystack: string | null | undefined,
  pattern: string | null | undefined
): boolean {
  if (!pattern?.trim() || haystack == null) return false;
  try {
    if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
      const last = pattern.lastIndexOf("/");
      const body = pattern.slice(1, last);
      const flags = pattern.slice(last + 1) || "i";
      return new RegExp(body, flags).test(haystack);
    }
    return haystack.toLowerCase().includes(pattern.toLowerCase());
  } catch {
    return haystack.toLowerCase().includes(pattern.toLowerCase());
  }
}
