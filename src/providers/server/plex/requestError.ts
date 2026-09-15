/** A request Plex answered with an error status, which it carries so a caller can tell "absent" from "failed". */
export class PlexRequestError extends Error {
  constructor(readonly status: number) {
    super(`Plex request failed (${status})`);
    this.name = 'PlexRequestError';
  }
}
