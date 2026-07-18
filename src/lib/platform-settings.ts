import type { PlatformSettings } from "@/lib/types";

/** Shape the root layout + admin form consume (subset of the `platform_settings` row). */
export type PlatformSettingsConfig = Pick<
  PlatformSettings,
  "banner_enabled" | "banner_message"
>;

/**
 * Fallback when the `platform_settings` row can't be read (e.g. pre-migration
 * or a transient error). Off, so a read failure never accidentally shows a
 * stale/wrong banner to every visitor.
 */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsConfig = {
  banner_enabled: false,
  banner_message: "",
};
