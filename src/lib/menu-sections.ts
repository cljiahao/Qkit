import type { MenuCategory, MenuItem } from "@/lib/types";

export interface MenuSection {
  id: string;
  label: string;
  items: MenuItem[];
}

const OTHER_SECTION_ID = "other";

/** Groups menu items by the booth's own category order, "Other" always last.
 * Empty sections are dropped, so a single non-empty result means "flat menu". */
export function groupByCategory(
  items: MenuItem[],
  categories: MenuCategory[],
): MenuSection[] {
  const knownIds = new Set(categories.map((c) => c.id));
  const sections: MenuSection[] = categories.map((c) => ({
    id: c.id,
    label: c.label,
    items: items.filter((it) => it.category === c.id),
  }));
  const other = items.filter(
    (it) => !it.category || !knownIds.has(it.category),
  );
  if (other.length > 0) {
    sections.push({ id: OTHER_SECTION_ID, label: "Other", items: other });
  }
  return sections.filter((s) => s.items.length > 0);
}
