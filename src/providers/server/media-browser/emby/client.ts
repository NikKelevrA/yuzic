import { createMediaBrowserClient, MediaBrowserClientConfig } from "../client";
import { EMBY_BRAND } from "../brand";

type EmbyClientConfig = MediaBrowserClientConfig;

export type EmbyClient = ReturnType<typeof createEmbyClient>;

export function createEmbyClient(config: EmbyClientConfig) {
  return createMediaBrowserClient(config, EMBY_BRAND);
}
