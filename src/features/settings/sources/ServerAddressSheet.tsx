import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { FormSheet, FormSheetField } from '@/components/FormSheet';
import type { SourceId } from '@/providers/registry/sources';
import { selectSourceServerUrls, setSourceServerUrl } from './state';

type Props = {
  source: SourceId;
  onClose: () => void;
};

/**
 * Asks for the address of a server of your own, for a source that can use one.
 *
 * The root address is what is asked for (`http://host:5000`), the same shape
 * the Connections screens take, and an empty one goes back to the public
 * server. Saving only stores it: nothing is sent to the address until a use
 * of the source is on, and the source's own switches still say what is asked.
 */
export default function ServerAddressSheet({ source, onClose }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const current = useSelector(selectSourceServerUrls)[source] ?? '';
  const [draft, setDraft] = useState(current);

  return (
    <FormSheet
      title={t('settings.sources.serverAddress.title')}
      description={t('settings.sources.serverAddress.description')}
      submitLabel={t('common.save')}
      canSubmit={draft.trim() !== current}
      onSubmit={async () => {
        dispatch(setSourceServerUrl({ source, url: draft }));
        return true;
      }}
      onClose={onClose}
    >
      <FormSheetField
        label={t('settings.sources.serverAddress.label')}
        value={draft}
        onChangeText={setDraft}
        placeholder={t('settings.sources.serverAddress.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        autoFocus
      />
    </FormSheet>
  );
}
