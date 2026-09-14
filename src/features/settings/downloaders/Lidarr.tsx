import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

import * as lidarr from '@/providers/integration/lidarr';
import type { LidarrQualityProfile } from '@/providers/integration/lidarr';
import SettingsCardHeader from '../components/SettingsCardHeader';
import SettingsSelectCard from '../components/SettingsSelectCard';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import {
  downloaderSelectors,
  useLidarrConfig,
  selectDefaultQualityProfileId,
} from '@/state/redux/selectors/downloadersSelectors';
import { setDefaultQualityProfileId } from '@/state/redux/slices/downloadersSlice';
import DownloaderSettingsScreen from './DownloaderSettingsScreen';

/**
 * The per-server default quality profile Lidarr applies when it has to
 * create an artist for an album Get. Fetched from Lidarr's own
 * `/qualityprofile` list only while connected — there is nothing to choose
 * from otherwise, and a failed fetch just leaves the card hidden rather than
 * crashing the screen.
 */
const QualityProfileCard: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const isAuthenticated = useSelector(downloaderSelectors.lidarr.isAuthenticated);
  const config = useLidarrConfig();
  const defaultQualityProfileId = useSelector(selectDefaultQualityProfileId);
  const serverId = activeServer?.id ?? '';

  const [profiles, setProfiles] = useState<LidarrQualityProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !config.serverUrl || !config.apiKey) {
      setProfiles([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    lidarr
      .getQualityProfiles(config)
      .then((result) => {
        if (!cancelled) setProfiles(result);
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, config]);

  if (!isAuthenticated || (!isLoading && profiles.length === 0)) return null;

  const items = profiles.map((profile) => ({ key: String(profile.id), label: profile.name }));

  return (
    <>
      <SettingsCardHeader title={t('settings.downloaders.lidarr.qualityProfileTitle')} subtle />
      <SettingsSelectCard
        title={t('settings.downloaders.lidarr.defaultQualityProfile')}
        items={items}
        isLoading={isLoading}
        isSelected={(key) => Number(key) === defaultQualityProfileId}
        onSelect={(key) =>
          serverId &&
          dispatch(setDefaultQualityProfileId({ serverId, qualityProfileId: Number(key) }))
        }
      />
    </>
  );
};

const LidarrView: React.FC = () => {
  return (
    <DownloaderSettingsScreen
      id="lidarr"
      testConnection={lidarr.testConnection}
      extraCards={<QualityProfileCard />}
    />
  );
};

export default LidarrView;
