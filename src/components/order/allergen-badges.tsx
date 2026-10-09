import type { ComponentType } from "react";
import { InfoTooltip } from "@merqo/ui";
import { ALLERGEN_ICONS } from "@/lib/allergen-icons";
import type { AllergenTag } from "@/lib/schemas";

// Built once at module scope so each tag's icon component stays referentially
// stable across renders (InfoTooltip takes a component, not an element).
const ICON_COMPONENTS = Object.fromEntries(
  (Object.keys(ALLERGEN_ICONS) as AllergenTag[]).map((tag) => [
    tag,
    function AllergenEmoji({ className }: { className?: string }) {
      return <span className={className}>{ALLERGEN_ICONS[tag]}</span>;
    },
  ]),
) as Record<AllergenTag, ComponentType<{ className?: string }>>;

function capitalize(tag: AllergenTag): string {
  return tag[0]!.toUpperCase() + tag.slice(1);
}

/** Icon-only allergen row for a menu card — tap/hover reveals the name.
 *  `trigger="tap"` since this is a mobile-first customer surface where hover
 *  never fires; see InfoTooltip's own doc comment on that mode. */
export function AllergenBadges({ tags }: { tags: AllergenTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1" aria-label="Contains allergens">
      {tags.map((tag) => (
        <InfoTooltip
          key={tag}
          trigger="tap"
          icon={ICON_COMPONENTS[tag]}
          content={capitalize(tag)}
          ariaLabel={`Contains ${tag}`}
        />
      ))}
    </div>
  );
}
