import React from 'react'
import { Ellipsis } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import type { Album } from '@/domain/entities/Album'
import { iconSize } from '@/constants/design'
import { DetailHeaderIconButton } from '@/components/DetailHeader'
import GenreOptions from '@/components/options/GenreOptions'
import { useSheetRef } from '@/components/useSheetRef'
import { useTheme } from '@/features/theme/useTheme'

/**
 * The "…" for a tag screen: queue actions and Download all.
 *
 * Its own file now that the genre hero it used to sit inside is gone. The
 * download action lives in the sheet rather than on the screen, the way every
 * other collection does it — a tag can be hundreds of albums, and a header
 * button that starts that is better one deliberate tap away.
 */
export default function GenreOptionsButton({ genre, albums }: { genre: string; albums: Album[] }) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const optionsSheetRef = useSheetRef()

  return (
    <>
      <DetailHeaderIconButton
        accessibilityLabel={t('a11y.common.moreOptions')}
        onPress={() => optionsSheetRef.current?.present()}
      >
        <Ellipsis size={iconSize.header} color={colors.secondary} />
      </DetailHeaderIconButton>
      <GenreOptions ref={optionsSheetRef} genre={genre} albums={albums} />
    </>
  )
}
