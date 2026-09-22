import React from 'react';
import { Ellipsis } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { SearchResult } from '@/features/search/SearchContext';
import type { Album } from '@/domain/entities/Album';
import { songResultToAlbum } from '@/features/search/searchResultAdapters';
import MediaListRow from '@/components/MediaListRow';
import IconActionButton from '@/components/IconActionButton';
import { useTheme } from '@/features/theme/useTheme';
import { iconSize } from '@/constants/design';

type Props = {
  result: SearchResult;
  navigateToAlbum: (album: Album) => void;
  onSelect: (result: SearchResult) => void;
  onPress: (result: SearchResult) => void;
  onOptions: (result: SearchResult) => void;
};

/**
 * A song result row, branching on provenance the same way `AlbumResult` does
 * (as an internal decision on the one component, not a second one `ResultRow`
 * would have to pick between — see its own doc comment).
 *
 * A local match plays on tap, same as it always has. An external match —
 * MusicBrainz today, through `searchRecording`/`mapRecordingSearchHit` —
 * carries no stream (`mapSong`'s own note: MusicBrainz never had one to begin
 * with), so tapping it opens the song's album instead, the same place
 * tapping that album directly would reach. There is nothing an options sheet
 * could offer a recording nobody owns — no queue, no playlist, nothing to
 * download as this one track — so the row carries none for it.
 */
export default function SongResult({ result, navigateToAlbum, onSelect, onPress, onOptions }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (result.source === 'external') {
    const album = songResultToAlbum(result);
    return (
      <MediaListRow
        title={result.title}
        testID="search-result-song"
        subtitle={result.subtext}
        cover={result.cover}
        onPress={() => {
          onSelect(result);
          if (album) navigateToAlbum(album);
        }}
      />
    );
  }

  return (
    <MediaListRow
      title={result.title}
      testID="search-result-song"
      subtitle={result.subtext}
      cover={result.cover}
      onPress={() => onPress(result)}
      trailing={
        <IconActionButton
          icon={<Ellipsis size={iconSize.header} color={colors.secondary} />}
          onPress={() => onOptions(result)}
          accessibilityLabel={t('a11y.rows.options', { title: result.title })}
          size="compact"
        />
      }
    />
  );
}
