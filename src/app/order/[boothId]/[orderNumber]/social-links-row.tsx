import { Globe, Instagram, Facebook, Music2 } from "lucide-react";
import type { SocialLinks } from "@/lib/types";

const ICONS: {
  key: keyof SocialLinks;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "website", label: "Website", icon: Globe },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "tiktok", label: "TikTok", icon: Music2 },
];

/** Icon row of the vendor's social/website links. Renders nothing if empty. */
export function SocialLinksRow({ links }: { links: SocialLinks }) {
  const entries = ICONS.filter(({ key }) => links[key]);
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
          className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Icon className="size-4" />
        </a>
      ))}
    </div>
  );
}
