import { ApiAdapter } from "@/providers/contracts/ServerAdapter";
import { Server } from "@/types/Server";

import { JELLYFIN_BRAND } from "../brand";
import { createMediaBrowserAdapter } from "../adapter";

/** Jellyfin is the MediaBrowser adapter with Jellyfin's brand — see
 *  `api/mediaBrowser/adapter.ts`. */
export const createJellyfinAdapter = (server: Server): ApiAdapter =>
  createMediaBrowserAdapter(server, JELLYFIN_BRAND);
