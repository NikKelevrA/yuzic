import en from '@/locales/en.json';
import fr from '@/locales/fr.json';
import ja from '@/locales/ja.json';
import zh from '@/locales/zh.json';
import { downloadErrorKey } from './errorKeys';

// Kept in step with the error code unions the two downloaders export. A code
// added there without a translation here shows the user a generic failure.
const LIDARR_CODES = [
  'missing_album_identity',
  'artist_identity_unresolved',
  'artist_identity_ambiguous',
  'external_identity_mismatch',
  'album_not_found_for_artist',
  'album_identity_ambiguous',
  'lidarr_metadata_unavailable',
  'request_timeout',
] as const;

const YTFALLBACK_CODES = [
  'no_tracks',
  'some_tracks_failed',
] as const;

const LOCALES = { en, fr, ja, zh } as Record<string, Record<string, any>>;

function lookup(bundle: Record<string, any>, key: string): unknown {
  return key.split('.').reduce<any>((node, part) => node?.[part], bundle);
}

describe('downloadErrorKey', () => {
  it('builds a downloader-scoped key from the code', () => {
    expect(downloadErrorKey('ytfallback', 'no_tracks')).toBe(
      'externalAlbum.download.errors.ytfallback.no_tracks'
    );
  });

  it('falls back to the generic failure key when there is no code', () => {
    expect(downloadErrorKey('lidarr', undefined)).toBe('externalAlbum.download.failed');
  });

  describe.each(Object.keys(LOCALES))('%s translations', (locale) => {
    const bundle = LOCALES[locale];

    it('translates the generic failure key', () => {
      expect(typeof lookup(bundle, 'externalAlbum.download.failed')).toBe('string');
    });

    it.each(LIDARR_CODES)('translates lidarr %s', (code) => {
      expect(typeof lookup(bundle, downloadErrorKey('lidarr', code))).toBe('string');
    });

    it.each(YTFALLBACK_CODES)('translates ytfallback %s', (code) => {
      expect(typeof lookup(bundle, downloadErrorKey('ytfallback', code))).toBe('string');
    });
  });
});
