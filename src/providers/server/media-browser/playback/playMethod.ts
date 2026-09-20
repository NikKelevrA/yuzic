/**
 * How the server is delivering a stream, in its own vocabulary.
 *
 * `DirectPlay` is the original file, byte for byte — what `Static=true` asks
 * for. `Transcode` is the server re-encoding on the fly, which is what asking
 * for `AudioCodec=` plus `MaxStreamingBitrate=` amounts to. `DirectStream`
 * sits between them (remux, no re-encode) and is a decision only the server
 * makes, so it is named here for completeness and never asserted by us.
 *
 * Every session report used to say `DirectStream` regardless of what had been
 * asked for. That is the one value of the three that is never true from where
 * this code stands: the app either asked for the original bytes or asked for a
 * re-encode, and it was reporting neither. The cost is not cosmetic — the
 * dashboard's transcoding column, an admin diagnosing server load, and any
 * bandwidth accounting all read this field, so a server quietly re-encoding
 * for forty phones read as forty direct streams.
 *
 * Its own module rather than a few lines in `report.ts` because the client
 * builds the stream URL and the report module reads the client: putting the
 * type where the reports live would make those two import each other, which
 * the cycle gate rejects — and rightly, since neither owns the other.
 */
export type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

/**
 * What the server is being asked for, from the stream format the quality
 * setting resolved to.
 *
 * Best effort in one direction only: this is what the *client requested*. A
 * server handed `AudioCodec=mp3` for a file that is already mp3 inside the
 * bitrate cap may well decide to direct-stream it instead, and there is no way
 * to know that from here. Over-declaring `Transcode` is the safe error — it
 * says "I asked this server to do work", which is true, where the old blanket
 * `DirectStream` said "no work is being done here", which is a claim the
 * client was never in a position to make.
 */
export function playMethodForStreamFormat(format: string): PlayMethod {
  return format === 'raw' ? 'DirectPlay' : 'Transcode';
}
