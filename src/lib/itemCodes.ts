import type { TastingItem } from "@/lib/types";

/**
 * Assigns running organizer-only codes (T1, T2, ...) in entry order (SPEC 5.3).
 * The code is permanent once assigned and never shown to participants.
 */
export function assignItemCodes(names: string[], makeId: () => string): TastingItem[] {
  return names.map((name, index) => ({
    id: makeId(),
    name,
    code: `T${index + 1}`,
  }));
}
