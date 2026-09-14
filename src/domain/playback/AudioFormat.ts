/**
 * How audio is asked for from a server.
 *
 * Domain vocabulary rather than settings vocabulary: a stream request names a
 * quality and a codec whether or not a user ever chose one, and the provider
 * adapters that build those requests should not have to import a settings
 * slice to name what they are asking for.
 */

/** How much the server may compress a stream. `original` asks it not to. */
export type AudioQuality = 'low' | 'medium' | 'high' | 'original';

/**
 * The container a server may transcode into. Which of these a provider can
 * actually produce is declared per adapter — see `SongsApi.streamableCodecs` —
 * so a setting is only offered where it does something.
 */
export type PreferredCodec = 'mp3' | 'opus';
