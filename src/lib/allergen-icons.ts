import type { AllergenTag } from "./schemas";

// Rendering-only — no effect on the stored tag values (ALLERGEN_TAGS).
// Shared by the vendor-side pickers (menu-editor.tsx item-level,
// option-groups-editor.tsx per-choice) and the customer-facing allergen
// badges (allergen-badges.tsx) so every allergen surface uses the same icon.
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
