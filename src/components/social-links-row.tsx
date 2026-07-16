import { SOCIAL_LINK_FIELDS } from "@/components/social-icons";
import type { SocialLinks } from "@/lib/types";

/**
 * Icon row of the vendor's social/website links. Renders nothing if empty.
 * Each mark sits on a fixed light chip (not the page's theme background) so
 * single-color brand marks like TikTok's stay legible in dark mode too.
 */
export function SocialLinksRow({ links }: { links: SocialLinks }) {
  const entries = SOCIAL_LINK_FIELDS.filter(({ key }) => links[key]);
  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {entries.map(({ key, label, icon: Icon }) => (
        <a
          key={key}
          href={links[key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="grid size-10 place-items-center rounded-full border border-black/5 bg-white text-neutral-700 shadow-sm transition-transform hover:scale-105"
        >
          <Icon className="size-4" />
        </a>
      ))}
    </div>
  );
}
