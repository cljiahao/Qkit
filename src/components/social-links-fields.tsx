"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FORM_LABEL_CLASS } from "@/lib/utils";
import { SOCIAL_LINK_FIELDS } from "@/components/social-icons";
import type { SocialLinks } from "@/lib/types";

const PLACEHOLDERS: Record<keyof SocialLinks, string> = {
  website: "https://your-stall.com",
  instagram: "https://instagram.com/yourstall",
  facebook: "https://facebook.com/yourstall",
  tiktok: "https://tiktok.com/@yourstall",
};

const FIELDS = SOCIAL_LINK_FIELDS.map((field) => ({
  ...field,
  placeholder: PLACEHOLDERS[field.key],
}));

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
