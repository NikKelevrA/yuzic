import React from 'react';
import * as downtify from '@/providers/integration/downtify';
import DownloaderSettingsScreen from './DownloaderSettingsScreen';

/**
 * Downtify's setup, which asks for an address and nothing else.
 *
 * `keyless` is what makes that so: Downtify's API has no authentication, so a
 * key field here would be a box with nothing to put in it. See the note on
 * `noAuth` in the downloader registry.
 */
const DowntifyView: React.FC = () => {
  return (
    <DownloaderSettingsScreen
      id="downtify"
      keyless
      testConnection={downtify.testConnection}
    />
  );
};

export default DowntifyView;
