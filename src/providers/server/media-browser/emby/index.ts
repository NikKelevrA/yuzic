import { ApiAdapter } from "@/providers/contracts/ServerAdapter";
import { Server } from "@/providers/contracts/Server";

import { EMBY_BRAND } from "../brand";
import { createMediaBrowserAdapter } from "../adapter";

/** Emby is the MediaBrowser adapter with Emby's brand — see
 *  `api/mediaBrowser/adapter.ts`. */
export const createEmbyAdapter = (server: Server): ApiAdapter =>
  createMediaBrowserAdapter(server, EMBY_BRAND);
