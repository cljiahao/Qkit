"use client";

import { Globe, Instagram, Facebook, Music2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FORM_LABEL_CLASS } from "@/lib/utils";
import type { SocialLinks } from "@/lib/types";

const FIELDS: {
  key: keyof SocialLinks;
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "website",
    label: "Website",
    placeholder: "https://your-stall.com",
    icon: Globe,
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/yourstall",
    icon: Instagram,
  },
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "https://facebook.com/yourstall",
    icon: Facebook,
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "https://tiktok.com/@yourstall",
    icon: Music2,
  },
];

export function SocialLinksFields({
  value,
  onChange,
  idPrefix,
}: {
  value: SocialLinks;
  onChange: (next: SocialLinks) => void;
  idPrefix: string;
}) {
  function setField(key: keyof SocialLinks, raw: string) {
    const next = { ...value };
    if (raw) next[key] = raw;
    else delete next[key];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {FIELDS.map(({ key, label, placeholder, icon: Icon }) => {
        const id = `${idPrefix}-${key}`;
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={id} className={FORM_LABEL_CLASS}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {label}
              </span>
            </Label>
            <Input
              id={id}
              value={value[key] ?? ""}
              placeholder={placeholder}
              className="h-11 rounded-xl"
              onChange={(e) => setField(key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
