import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { FormSheet, FormSheetField } from '@/components/FormSheet';
import { spacing, statusColor, typography } from '@/constants/design';
import { forgetReachable } from '@/providers/http/urlFailover';
import { checkServerAddress } from '@/providers/registry/serverAddress';
import { parseServerAddress, type SourceId } from '@/providers/registry/sources';
import {
  selectSourceFallbackUrls,
  selectSourceServerUrls,
  setSourceFallbackUrl,
  setSourceServerUrl,
} from './state';

type Props = {
  source: SourceId;
  onClose: () => void;
};

/**
 * Asks for the address of a server of your own, for a source that can use one.
 *
 * The root address is what is asked for (`http://host:5000`), the same shape
 * the Connections screens take, and an empty one goes back to the public
 * server. An address is checked before it is kept: it always has to look like
 * a web address, and — on its own, with no fallback set — the server has to
 * answer too, so the sheet stays open with what was typed, saying which. This
 * catches a typo'd or not-yet-running server, rather than it showing up later
 * as a search that quietly finds nothing. Saving only stores it: nothing is
 * sent to the address until a use of the source is on, and the source's own
 * switches still say what is asked.
 *
 * A second, optional address can back it up — a Tailscale or domain address
 * for a server that is reached by its LAN address at home. Only its shape is
 * checked, never whether it answers: away from home the first address cannot
 * answer, and a fallback that is only reachable from outside cannot be
 * checked from inside either. For the same reason, once a fallback is also
 * being set, the first address not answering stops being a reason to refuse
 * it too — that pairing is exactly for using this away from home, so only a
 * genuinely malformed first address (not just an unreachable one) still
 * blocks saving. The first address is only asked to answer at all when it
 * was changed.
 */
export default function ServerAddressSheet({ source, onClose }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const current = useSelector(selectSourceServerUrls)[source] ?? '';
  const currentFallback = useSelector(selectSourceFallbackUrls)[source] ?? '';
  const [draft, setDraft] = useState(current);
  const [draftFallback, setDraftFallback] = useState(currentFallback);
  const [problem, setProblem] = useState<'invalid' | 'unreachable' | 'fallbackInvalid' | null>(null);

  return (
    <FormSheet
      title={t('settings.sources.serverAddress.title')}
      description={t('settings.sources.serverAddress.description')}
      submitLabel={t('common.save')}
      canSubmit={draft.trim() !== current || draftFallback.trim() !== currentFallback}
      onSubmit={async () => {
        setProblem(null);
        // Empty is "use the public server": nothing to check, and nothing for
        // a fallback to back up.
        if (!draft.trim()) {
          dispatch(setSourceServerUrl({ source, url: '' }));
          dispatch(setSourceFallbackUrl({ source, url: '' }));
          forgetReachable(source);
          return true;
        }
        let fallback = '';
        if (draftFallback.trim()) {
          const parsed = parseServerAddress(draftFallback);
          if (!parsed) {
            setProblem('fallbackInvalid');
            return false;
          }
          fallback = parsed;
        }
        let address = current;
        if (draft.trim() !== current) {
          const result = await checkServerAddress(source, draft);
          if (result.ok) {
            address = result.address;
          } else if (result.reason === 'unreachable' && fallback) {
            // A fallback is being set alongside it, so this pair is meant
            // for exactly this situation: away from home, the primary
            // address cannot answer right now, and that is not a reason to
            // refuse it when a fallback is there to cover it. A malformed
            // address (`reason === 'invalid'`) still blocks unconditionally
            // — that is always a typo, fallback or not.
            address = parseServerAddress(draft) ?? current;
          } else {
            setProblem(result.reason);
            return false;
          }
        }
        dispatch(setSourceServerUrl({ source, url: address }));
        dispatch(setSourceFallbackUrl({ source, url: fallback }));
        // The address that answered last is remembered for the session; a
        // changed list starts again from the first.
        forgetReachable(source);
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
      <FormSheetField
        label={t('settings.sources.serverAddress.fallbackLabel')}
        value={draftFallback}
        onChangeText={text => { setDraftFallback(text); setProblem(null); }}
        placeholder={t('settings.sources.serverAddress.fallbackPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {problem && (
        <Text testID="server-address-problem" style={styles.problem}>
          {t(`settings.sources.serverAddress.${problem}`)}
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
