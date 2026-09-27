import React, { useMemo, useState } from 'react';
import { Palette } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import SingleSelectBottomSheet, { type SingleSelectOption } from '@/components/SingleSelectBottomSheet';
import { confirmDestructive } from '@/components/confirmDestructive';
import { useSheetRef } from '@/components/useSheetRef';
import {
  addProfile,
  deleteProfile,
  renameProfile,
  selectActiveProfile,
  selectProfiles,
  switchProfile,
} from '@/features/settings/appearance/state';
import { DEFAULT_PROFILE_ID, type ThemeProfile } from '@/features/settings/appearance/themeStore';
import { disambiguate } from '../profileNames';
import SettingsCard from '../../components/SettingsCard';
import SettingsDivider from '../../components/SettingsDivider';
import SettingsRow from '../../components/SettingsRow';
import ProfileNameSheet from './ProfileNameSheet';

/**
 * What to call each profile: the user's name for it, or the app's, numbered
 * where two of them would otherwise read the same.
 *
 * Keyed by id rather than returned in order, so a caller asking about one
 * profile does not have to know where it sits in the list.
 */
function useProfileLabels(profiles: ThemeProfile[]): Map<string, string> {
  const { t } = useTranslation();
  return useMemo(() => {
    const raw = profiles.map(p => p.name ?? (p.nameKey ? t(p.nameKey) : ''));
    const labels = disambiguate(raw);
    return new Map(profiles.map((p, i) => [p.id, labels[i]]));
  }, [profiles, t]);
}

/**
 * Which look the app is wearing, and the making and unmaking of them.
 *
 * At the top of Appearance because it scopes everything under it: every page
 * below this row edits whichever profile this row names. The Yuzic look is
 * always the first option and cannot be renamed or deleted — it is what every
 * other profile is a departure from, and what deleting the last of them leaves
 * you on. Editing anything while it is selected quietly forks a copy and
 * selects that, which is why this row can change its own name without the user
 * having touched it; see `editActiveTheme`.
 */
export const ProfileSelector: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const profiles = useSelector(selectProfiles);
  const active = useSelector(selectActiveProfile);
  const labels = useProfileLabels(profiles);
  const nameOf = (profile: ThemeProfile) => labels.get(profile.id) ?? '';
  const sheetRef = useSheetRef();
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);

  const isDefault = active.id === DEFAULT_PROFILE_ID;

  const options = useMemo<SingleSelectOption[]>(
    () => profiles.map(profile => ({ value: profile.id, label: labels.get(profile.id) ?? '', Icon: Palette })),
    [profiles, labels],
  );

  const confirmDelete = () => {
    confirmDestructive({
      title: t('settings.appearance.profiles.deleteTitle', { name: nameOf(active) }),
      body: t('settings.appearance.profiles.deleteBody'),
      cancelLabel: t('common.cancel'),
      confirmLabel: t('common.delete'),
      onConfirm: () => { dispatch(deleteProfile(active.id)); },
    });
  };

  return (
    <>
      <SettingsCard>
        <SettingsRow
          testID="appearance-profile"
          label={t('settings.appearance.profiles.title')}
          rightText={nameOf(active)}
          onPress={() => sheetRef.current?.present()}
        />
        <SettingsDivider />
        <SettingsRow
          testID="appearance-profile-new"
          label={t('settings.appearance.profiles.new')}
          onPress={() => setNaming('new')}
        />
        {/* The app's own look is not the user's to rename or throw away. */}
        {!isDefault && (
          <>
            <SettingsDivider />
            <SettingsRow
              testID="appearance-profile-rename"
              label={t('settings.appearance.profiles.rename')}
              onPress={() => setNaming('rename')}
            />
            <SettingsDivider />
            <SettingsRow
              testID="appearance-profile-delete"
              label={t('settings.appearance.profiles.delete')}
              onPress={confirmDelete}
            />
          </>
        )}
      </SettingsCard>

      <SingleSelectBottomSheet
        ref={sheetRef}
        testID="profile-sheet"
        selected={active.id}
        options={options}
        title={t('settings.appearance.profiles.title')}
        onSelect={id => {
          dispatch(switchProfile(id));
          sheetRef.current?.dismiss();
        }}
      />

      {naming && (
        <ProfileNameSheet
          title={t(naming === 'new'
            ? 'settings.appearance.profiles.newTitle'
            : 'settings.appearance.profiles.renameTitle')}
          submitLabel={t(naming === 'new' ? 'settings.appearance.profiles.create' : 'common.save')}
          initialName={naming === 'new'
            ? t('settings.appearance.profiles.copyOf', { name: nameOf(active) })
            : nameOf(active)}
          onSubmit={name => {
            if (naming === 'new') dispatch(addProfile({ name }));
            else dispatch(renameProfile({ id: active.id, name }));
          }}
          onClose={() => setNaming(null)}
        />
      )}
    </>
  );
};
