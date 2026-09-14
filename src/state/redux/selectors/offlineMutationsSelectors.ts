import { RootState } from '@/state/redux/store';

export const selectOfflineMutationQueue = (state: RootState) => state.offlineMutations.queue;
