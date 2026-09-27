import React from 'react';
import * as ytfallback from '@/providers/integration/ytfallback';
import DownloaderSettingsScreen from './DownloaderSettingsScreen';

const YtFallbackView: React.FC = () => {
  return (
    <DownloaderSettingsScreen
      id="ytfallback"
      testConnection={ytfallback.testConnection}
    />
  );
};

export default YtFallbackView;
