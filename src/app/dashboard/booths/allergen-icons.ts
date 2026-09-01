import type { AllergenTag } from "@/lib/schemas";

// Rendering-only — no effect on the stored tag values (ALLERGEN_TAGS).
// Shared by menu-editor.tsx (item-level) and option-groups-editor.tsx
// (per-choice) so both allergen pickers stay visually identical.
export const ALLERGEN_ICONS: Record<AllergenTag, string> = {
  dairy: "🥛",
  nuts: "🌰",
  gluten: "🌾",
  soy: "🌱",
  egg: "🥚",
  caffeine: "☕",
  crustaceans: "🦐",
  fish: "🐟",
  peanuts: "🥜",
  celery: "🥬",
  mustard: "🟡",
  sesame: "⚫",
  sulphites: "🧪",
  lupin: "🫘",
  molluscs: "🐚",
};
