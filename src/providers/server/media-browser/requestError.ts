/** A request Jellyfin or Emby answered with an error status, carried so a caller can tell "absent" from "failed". */
export class MediaBrowserRequestError extends Error {
  constructor(label: string, readonly status: number, body: string) {
    super(`${label} API error (${status}): ${body}`);
    this.name = 'MediaBrowserRequestError';
  }
}
