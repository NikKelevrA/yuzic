import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { notify } from '@/components/toast';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import ExternalSourcePickerSheet, { type PickerItem } from '@/components/ExternalSourcePickerSheet';
import { useEnabledExternalSources, type SourceResolvedAlbum, type SourceResolvedArtist } from './registry';
import { useLibrary } from '@/contexts/LibraryContext';
import { useArtists } from '@/hooks/artists';
import { matchAlbumToLibrary } from '@/hooks/libraryMatch';
import { normalize } from '@/utils/normalize';
import type { ExternalAlbumBase, ExternalArtistBase } from '@/types';

const NO_SOURCE_TOAST = 'Enable an external source in Settings to browse this content.';

type ResolutionContextType = {
  resolveAndNavigateToAlbum: (item: ExternalAlbumBase) => void;
  resolveAndNavigateToArtist: (item: ExternalArtistBase) => void;
};

const ExternalResolutionContext = createContext<ResolutionContextType | null>(null);

export function useExternalResolution(): ResolutionContextType {
  const ctx = useContext(ExternalResolutionContext);
  if (!ctx) throw new Error('useExternalResolution must be used within ExternalResolutionProvider');
  return ctx;
}

export function ExternalResolutionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const enabledSources = useEnabledExternalSources();
  const { albums } = useLibrary();
  const { artists } = useArtists();

  const albumPickerRef = useRef<BottomSheetModal>(null);
  const artistPickerRef = useRef<BottomSheetModal>(null);
  const [albumPickerItems, setAlbumPickerItems] = useState<PickerItem[]>([]);
  const [artistPickerItems, setArtistPickerItems] = useState<PickerItem[]>([]);

  // Callers that want to bypass the library match (fuzzy false positives)
  // don't come through here — they push albumView/artistView directly with
  // forceExternal, which the unified screens honor.
  const resolveAndNavigateToAlbum = useCallback(async (item: ExternalAlbumBase) => {
    const localMatch = matchAlbumToLibrary(item, albums);
    if (localMatch) {
      // /albumView resolves this param by calling the server adapter
      // (useAlbum -> api.albums.get(id)), so it needs the origin's own id,
      // not the on-device localId. Domain albums carry that as `nativeId`;
      // the pre-rewrite shapes matchAlbumToLibrary can also return still key
      // it as `id`.
      const nativeId = 'nativeId' in localMatch ? localMatch.nativeId : localMatch.id;
      router.push({ pathname: '/albumView', params: { id: nativeId } });
      return;
    }

    if (enabledSources.length === 0) {
      notify.error(NO_SOURCE_TOAST);
      return;
    }

    // If only one source enabled and it matches the item's source, navigate directly
    if (enabledSources.length === 1 && (!item.externalSource || enabledSources[0].id === item.externalSource)) {
      router.push({ pathname: '/albumView', params: { source: item.externalSource ?? enabledSources[0].id, albumId: item.id, artist: item.artist, title: item.title } });
      return;
    }

    // Resolve across all enabled sources
    const results = (await Promise.all(
      enabledSources.map(s => s.resolveAlbum(item.artist, item.title).catch(() => null))
    )).filter(Boolean) as SourceResolvedAlbum[];

    if (results.length === 0) {
      notify.error('This album could not be found on any enabled source.');
      return;
    }
    if (results.length === 1) {
      router.push({ pathname: '/albumView', params: { source: results[0].source, albumId: results[0].id, artist: results[0].artist, title: results[0].title } });
      return;
    }
    setAlbumPickerItems(results.map(r => ({ ...r, kind: 'album' as const })));
    albumPickerRef.current?.present();
  }, [albums, enabledSources, router]);

  const resolveAndNavigateToArtist = useCallback(async (item: ExternalArtistBase) => {
    // `matchArtistToLibrary` (src/hooks/libraryMatch.ts) still types its
    // `artists` param as the pre-rewrite `Artist`, and that file is out of
    // scope here; `useArtists()` now returns domain `Artist[]`. The matching
    // rule itself (mbid, else normalized name) is unchanged — mirrored here
    // against the domain shape rather than casting into the legacy one.
    const normName = normalize(item.name);
    const itemMbid = item.externalIds?.mbid;
    const localMatch = artists.find(a =>
      (itemMbid && a.externalIds.mbid && a.externalIds.mbid === itemMbid) ||
      normalize(a.name) === normName
    ) ?? null;
    if (localMatch) {
      // Server adapter identity, same reasoning as the album branch above.
      router.push({ pathname: '/artistView', params: { id: localMatch.nativeId } });
      return;
    }

    if (enabledSources.length === 0) {
      notify.error(NO_SOURCE_TOAST);
      return;
    }

    if (enabledSources.length === 1 && (!item.externalSource || enabledSources[0].id === item.externalSource)) {
      router.push({ pathname: '/artistView', params: { source: item.externalSource ?? enabledSources[0].id, artistId: item.externalIds?.deezerId, mbid: item.externalIds?.mbid ?? item.id, name: item.name } });
      return;
    }

    const results = (await Promise.all(
      enabledSources.map(s => s.resolveArtist(item.name).catch(() => null))
    )).filter(Boolean) as SourceResolvedArtist[];

    if (results.length === 0) {
      notify.error('This artist could not be found on any enabled source.');
      return;
    }
    if (results.length === 1) {
      router.push({ pathname: '/artistView', params: { source: results[0].source, artistId: results[0].id, name: results[0].name } });
      return;
    }
    setArtistPickerItems(results.map(r => ({ ...r, kind: 'artist' as const })));
    artistPickerRef.current?.present();
  }, [artists, enabledSources, router]);

  return (
    <ExternalResolutionContext.Provider value={{ resolveAndNavigateToAlbum, resolveAndNavigateToArtist }}>
      {children}
      <ExternalSourcePickerSheet
        ref={albumPickerRef}
        items={albumPickerItems}
        onSelect={item => {
          albumPickerRef.current?.dismiss();
          const artist = item.kind === 'album' ? item.artist : '';
          const title = item.kind === 'album' ? item.title : '';
          router.push({ pathname: '/albumView', params: { source: item.source, albumId: item.id, artist, title } });
        }}
      />
      <ExternalSourcePickerSheet
        ref={artistPickerRef}
        items={artistPickerItems}
        onSelect={item => {
          artistPickerRef.current?.dismiss();
          const artistName = item.kind === 'artist' ? item.name : '';
          router.push({ pathname: '/artistView', params: { source: item.source, artistId: item.id, name: artistName } });
        }}
      />
    </ExternalResolutionContext.Provider>
  );
}
