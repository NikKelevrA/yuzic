import React from 'react';
import { Ellipsis } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { SearchResult } from '@/features/search/SearchContext';
import MediaListRow from '@/components/MediaListRow';
import IconActionButton from '@/components/IconActionButton';
import { useTheme } from '@/features/theme/useTheme';
import { iconSize } from '@/constants/design';

type Props = {
  result: SearchResult;
  onPress: (result: SearchResult) => void;
  onOptions: (result: SearchResult) => void;
};

/** A song result row — always local; there is no external song search
 *  today (see `SearchEntityType`). */
export default function SongResult({ result, onPress, onOptions }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
