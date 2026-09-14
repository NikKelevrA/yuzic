import { createMediaBrowserClient, MediaBrowserClientConfig } from "../client";
import { JELLYFIN_BRAND } from "../brand";

export type JellyfinClientConfig = MediaBrowserClientConfig;

export type JellyfinClient = ReturnType<typeof createJellyfinClient>;

export function createJellyfinClient(config: JellyfinClientConfig) {
  return createMediaBrowserClient(config, JELLYFIN_BRAND);
}
