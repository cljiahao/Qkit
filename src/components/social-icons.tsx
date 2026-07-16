import { Globe } from "lucide-react";
import {
  SiInstagram,
  SiFacebook,
  SiTiktok,
} from "@icons-pack/react-simple-icons";
import type { SocialLinks } from "@/lib/types";

/**
 * Shared vendor social-link field list: real brand marks + official colors
 * (via Simple Icons, `color="default"`) everywhere a link is shown or
 * edited. `website` has no brand mark — a generic globe, tinted by the
 * caller via currentColor.
 */
export const SOCIAL_LINK_FIELDS: {
  key: keyof SocialLinks;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}[] = [
  { key: "website", label: "Website", icon: Globe },
  {
    key: "instagram",
    label: "Instagram",
    icon: (props) => <SiInstagram color="default" {...props} />,
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: (props) => <SiFacebook color="default" {...props} />,
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: (props) => <SiTiktok color="default" {...props} />,
  },
];
