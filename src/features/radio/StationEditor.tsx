import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notify } from '@/components/toast';
import { FormSheet, FormSheetField } from '@/components/FormSheet';
import { useApi } from '@/providers/registry/useApi';
import type { InternetRadioStation } from '@/providers/contracts/ServerAdapter';

/**
 * Add or edit one station.
 *
 * Its own file rather than a second component inside `RadioScreen`: the
 * screen grew sort and grid controls and crossed the file-size limit, and of
 * the two things in there this is the one that is genuinely separate — a form
 * over `api.radio`, which knows nothing about how the list is drawn.
 */
export default function StationEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: InternetRadioStation | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [name, setName] = useState(initial?.name ?? '');
  const [streamUrl, setStreamUrl] = useState(initial?.streamUrl ?? '');
  const [homepageUrl, setHomepageUrl] = useState(initial?.homepageUrl ?? '');

  const canSave = name.trim().length > 0 && /^https?:\/\//i.test(streamUrl.trim());

  const handleSave = useCallback(async () => {
    if (!api.radio) return false;
    try {
      const trimmedHomepage = homepageUrl.trim();
      if (initial) {
        // Sent even when empty — that is how clearing a homepage reaches the
        // server; see `updateInternetRadioStation`.
        await api.radio.update({
          id: initial.id,
          name: name.trim(),
          streamUrl: streamUrl.trim(),
          homepageUrl: trimmedHomepage,
        });
      } else {
        await api.radio.create({
          name: name.trim(),
          streamUrl: streamUrl.trim(),
          homepageUrl: trimmedHomepage || undefined,
        });
      }
      await onSaved();
      return true;
    } catch {
      notify.error(t('common.error.unexpected'));
      return false;
    }
  }, [api.radio, homepageUrl, initial, name, onSaved, streamUrl, t]);

  return (
    <FormSheet
      title={initial ? t('radio.editTitle') : t('radio.addTitle')}
      submitLabel={t('common.save')}
      canSubmit={canSave}
      onSubmit={handleSave}
      onClose={onClose}
    >
      <FormSheetField
        label={t('radio.field.name')}
        value={name}
        onChangeText={setName}
        placeholder="Radio Paradise"
      />
      <FormSheetField
        label={t('radio.field.streamUrl')}
        value={streamUrl}
        onChangeText={setStreamUrl}
        placeholder="https://stream.radioparadise.com/aac-320"
        autoCapitalize="none"
        keyboardType="url"
      />
      <FormSheetField
        label={t('radio.field.homepage')}
        value={homepageUrl}
        onChangeText={setHomepageUrl}
        placeholder="https://radioparadise.com"
        autoCapitalize="none"
        keyboardType="url"
      />
    </FormSheet>
  );
}
