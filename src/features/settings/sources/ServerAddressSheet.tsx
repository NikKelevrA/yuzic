import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { FormSheet, FormSheetField } from '@/components/FormSheet';
import { spacing, statusColor, typography } from '@/constants/design';
import { checkServerAddressWithFallback } from '@/providers/registry/serverAddress';
import type { SourceId } from '@/providers/registry/sources';
import {
  selectSourceFallbackServerUrls,
  selectSourceServerUrls,
  setSourceFallbackServerUrl,
  setSourceServerUrl,
  setSourceUse,
} from './state';

type Props = {
  source: SourceId;
  onClose: () => void;
};

/**
 * Asks for the address of a server of your own, for a source that can use
 * one, plus an optional fallback for when the primary one doesn't answer.
 *
 * The root address is what is asked for (`http://host:5000`), the same shape
 * the Connections screens take, and an empty primary goes back to the public
 * server. Saving checks the primary address first and, only if that fails,
 * the fallback — so a primary that's merely unreachable right now (over a
 * VPN you're not on at the moment, say) doesn't block saving as long as the
 * fallback answers instead. Saving only stores the addresses: nothing is
 * sent to either until a use of the source is on, and the source's own
 * switches still say what is asked. The same "primary, then fallback" order
 * applies to real requests too, not just this check — see
 * `currentMusicbrainzClient`.
 */
export default function ServerAddressSheet({ source, onClose }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const current = useSelector(selectSourceServerUrls)[source] ?? '';
  const currentFallback = useSelector(selectSourceFallbackServerUrls)[source] ?? '';
  const [draft, setDraft] = useState(current);
  const [fallbackDraft, setFallbackDraft] = useState(currentFallback);
  const [problem, setProblem] = useState<'invalid' | 'unreachable' | null>(null);
  const [fallbackProblem, setFallbackProblem] = useState<'invalid' | null>(null);

  return (
    <FormSheet
      title={t('settings.sources.serverAddress.title')}
      description={t('settings.sources.serverAddress.description')}
      submitLabel={t('common.save')}
      canSubmit={draft.trim() !== current || fallbackDraft.trim() !== currentFallback}
      onSubmit={async () => {
        // Empty primary is "use the public server": nothing to check, and a
        // fallback means nothing without a primary to be a fallback of.
        if (!draft.trim()) {
          dispatch(setSourceServerUrl({ source, url: '' }));
          return true;
        }
        setProblem(null);
        setFallbackProblem(null);
        const result = await checkServerAddressWithFallback(source, draft, fallbackDraft);
        if (!result.ok) {
          if (result.reason === 'invalid') {
            if (result.field === 'fallback') setFallbackProblem('invalid');
            else setProblem('invalid');
          } else {
            setProblem('unreachable');
          }
          return false;
        }
        dispatch(setSourceServerUrl({ source, url: result.address }));
        dispatch(setSourceFallbackServerUrl({ source, url: result.fallbackAddress ?? '' }));
        // Setting up a self-hosted MusicBrainz server is what this app now
        // treats as opting in to everything gated behind
        // `useSelfHostedMusicbrainzConfigured` — including asking
        // MusicBrainz itself in search, which stays off (like every outside
        // source) until this point. Left as a one-time default: the switch
        // is a normal, user-editable one from here, same as any other.
        if (source === 'musicbrainz') {
          dispatch(setSourceUse({ use: 'musicbrainz.search', enabled: true }));
        }
        return true;
      }}
      onClose={onClose}
    >
      <FormSheetField
        label={t('settings.sources.serverAddress.label')}
        value={draft}
        onChangeText={text => { setDraft(text); setProblem(null); }}
        placeholder={t('settings.sources.serverAddress.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        autoFocus
      />
      {problem && (
        <Text testID="server-address-problem" style={styles.problem}>
          {t(`settings.sources.serverAddress.${problem}`)}
        </Text>
      )}
      <FormSheetField
        label={t('settings.sources.serverAddress.fallbackLabel')}
        value={fallbackDraft}
        onChangeText={text => { setFallbackDraft(text); setFallbackProblem(null); }}
        placeholder={t('settings.sources.serverAddress.fallbackPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {fallbackProblem && (
        <Text testID="server-address-fallback-problem" style={styles.problem}>
          {t(`settings.sources.serverAddress.${fallbackProblem}`)}
        </Text>
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  problem: {
    ...typography.caption,
    color: statusColor.errorText,
    marginTop: spacing.xs,
  },
});
