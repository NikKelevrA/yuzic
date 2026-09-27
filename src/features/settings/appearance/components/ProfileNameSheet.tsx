import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FormSheet, FormSheetField } from '@/components/FormSheet';

/**
 * Asks what to call a profile, whether it is being made or renamed.
 *
 * A sheet rather than `Alert.prompt`, which exists only on iOS — see
 * `RenamePlaylistSheet`, which learned that the hard way.
 */
export default function ProfileNameSheet({
  title,
  submitLabel,
  initialName,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initialName: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <FormSheet
      title={title}
      submitLabel={submitLabel}
      canSubmit={trimmed.length > 0}
      onSubmit={async () => {
        onSubmit(trimmed);
        return true;
      }}
      onClose={onClose}
    >
      <FormSheetField
        label={t('settings.appearance.profiles.nameLabel')}
        value={name}
        onChangeText={setName}
        placeholder={t('settings.appearance.profiles.namePlaceholder')}
        autoFocus
        selectTextOnFocus
      />
    </FormSheet>
  );
}
