import { Alert } from 'react-native';

/**
 * Ask before doing something that cannot be undone, then do it.
 *
 * One answer to a question the app asks in ten places — deleting a station, a
 * share, a podcast, a playlist, a download, an appearance profile. Every one
 * of them had written the same three-button `Alert.alert` by hand, and they
 * had already drifted: some report a failure afterwards and some fail
 * silently.
 *
 * It lived in `entity-actions/shared/starActions` and was imported across
 * features from there, which is how it stayed invisible to everything that
 * was not already an entity action. It is not about stars and never was.
 */
export function confirmDestructive(opts: {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}): void {
  Alert.alert(opts.title, opts.body, [
    { text: opts.cancelLabel, style: 'cancel' },
    { text: opts.confirmLabel, style: 'destructive', onPress: () => void opts.onConfirm() },
  ]);
}
