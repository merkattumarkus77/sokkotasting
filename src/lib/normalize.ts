/** Normalizes a name for uniqueness comparisons (nameKey, category merging). */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Turns free text into a URL/id-safe slug for categoryId. */
export function slugify(text: string): string {
  return normalizeName(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (ä -> a, ö -> o, ...)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
