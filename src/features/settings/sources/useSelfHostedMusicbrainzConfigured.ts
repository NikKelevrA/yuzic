import { useSelector } from 'react-redux';
import { selectSourceServerUrls } from './state';

/**
 * Whether a MusicBrainz server of your own is configured — the one gate
 * shared by every barebone change this fork adds on top of stock 2.9.0.
 *
 * The rule behind this hook: without a self-hosted address saved, the app is
 * meant to behave exactly like stock 2.9.0 — nothing else in this codebase
 * should change what the app does unless this returns true. A server you
 * pointed at on purpose is trusted differently than the shared public one,
 * which the public-MusicBrainz path (and everyone not running their own
 * server) never sees any of this touch.
 */
export function useSelfHostedMusicbrainzConfigured(): boolean {
  const serverUrl = useSelector(selectSourceServerUrls).musicbrainz;
  return !!serverUrl?.trim();
}
