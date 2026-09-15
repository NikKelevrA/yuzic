import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Playlist } from '@/domain/entities/Playlist';
import { FormSheet, FormSheetField } from '@/components/FormSheet';
import { notify } from '@/components/toast';
import { useRenamePlaylist } from './useRenamePlaylist';

/**
 * Asks for a playlist's new name.
 *
 * This was `Alert.prompt`, which exists only on iOS: on Android, Rename did
 * nothing at all. A failed rename keeps the sheet open with the name typed.
 */
export default function RenamePlaylistSheet({ playlist, onClose }: { playlist: Playlist; onClose: () => void }) {
  const { t } = useTranslation();
  const renamePlaylist = useRenamePlaylist();
  const [name, setName] = useState(playlist.title);
  const trimmed = name.trim();

  return (
    <FormSheet
      title={t('playlistOptions.rename.title')}
      submitLabel={t('common.save')}
      canSubmit={trimmed.length > 0 && trimmed !== playlist.title}
      onSubmit={async () => {
        try {
          await renamePlaylist.mutateAsync({ id: playlist.nativeId, newName: trimmed });
          notify.success(t('playlistOptions.toasts.renamed'));
          return true;
        } catch {
          notify.error(t('playlistOptions.toasts.renameFailed'));
          return false;
        }
      }}
      onClose={onClose}
    >
      <FormSheetField
        label={t('playlistOptions.rename.placeholder')}
        value={name}
        onChangeText={setName}
        placeholder={t('playlistOptions.rename.placeholder')}
        autoFocus
        selectTextOnFocus
      />
    </FormSheet>
  );
}
