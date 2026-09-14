import { createMediaBrowserClient, MediaBrowserClientConfig } from "../client";
import { JELLYFIN_BRAND } from "../brand";

type JellyfinClientConfig = MediaBrowserClientConfig;

export function createJellyfinClient(config: JellyfinClientConfig) {
  return createMediaBrowserClient(config, JELLYFIN_BRAND);
}
