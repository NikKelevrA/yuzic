import { useSelector } from 'react-redux';
import { selectSourceServerUrls } from './state';

/**
 * Whether a MusicBrainz server of your own is configured — the one gate
 * shared by every feature this fork adds on top of stock 2.9.0 (the search
 * result-count widening in `providers/registry/musicbrainz.ts`, the
 * entity-type quick-filter row, the search-result type badges, and
 * tap-to-download-and-play in `useAcquireAndPlaySong`). Pulled into one place
 * so "what counts as self-hosted" is answered once — the same reasoning
 * `useSearchScreenModel`'s `defaultToMusicbrainz` already relied on before
 * this was its own hook: a server you pointed at on purpose is trusted
 * differently than the shared public one, which every one of these features
 * leaves untouched.
 */
export function useSelfHostedMusicbrainzConfigured(): boolean {
  const serverUrl = useSelector(selectSourceServerUrls).musicbrainz;
  return !!serverUrl?.trim();
}
