import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { removeServer } from '@/state/redux/slices/serversSlice';
import {
  enqueueOfflineMutation,
  OfflineMutation,
} from '@/features/offline/offlineMutations';

interface OfflineMutationsState {
  queue: OfflineMutation[];
}

const initialState: OfflineMutationsState = {
  queue: [],
};

const offlineMutationsSlice = createSlice({
  name: 'offlineMutations',
  initialState,
  reducers: {
    enqueueOfflineMutationAction(state, action: PayloadAction<OfflineMutation>) {
      state.queue = enqueueOfflineMutation(state.queue, action.payload);
    },
    removeOfflineMutation(state, action: PayloadAction<string>) {
      state.queue = state.queue.filter(item => item.id !== action.payload);
    },
    markOfflineMutationFailed(
      state,
      action: PayloadAction<{
        id: string;
        error: string;
        failedAt: number;
        nextRetryAt: number;
      }>
    ) {
      const mutation = state.queue.find(item => item.id === action.payload.id);
      if (!mutation) return;

      mutation.retryCount = (mutation.retryCount ?? 0) + 1;
      mutation.lastError = action.payload.error;
      mutation.lastFailedAt = action.payload.failedAt;
      mutation.nextRetryAt = action.payload.nextRetryAt;
    },
    retryOfflineMutationsForServer(state, action: PayloadAction<string>) {
      state.queue.forEach(item => {
        if (item.serverId !== action.payload) return;

        delete item.lastError;
        delete item.lastFailedAt;
        delete item.nextRetryAt;
      });
    },
    clearOfflineMutationsForServer(state, action: PayloadAction<string>) {
      state.queue = state.queue.filter(item => item.serverId !== action.payload);
    },
  },
  /**
   * Forget a server the listener removed.
   *
   * Wired to the action rather than dispatched beside it, because the one
   * caller that removes a server should not have to remember every slice that
   * kept something for it — and the next caller would not.
   */
  extraReducers: builder => {
    builder.addCase(removeServer, (state, action) => {
      // Flat queue rather than a map: a mutation names the server it is bound
      // for, and one bound for a server that no longer exists can never be
      // replayed.
      state.queue = state.queue.filter(item => item.serverId !== action.payload);
    });
  },
});

export const {
  enqueueOfflineMutationAction,
  removeOfflineMutation,
  markOfflineMutationFailed,
  retryOfflineMutationsForServer,
  clearOfflineMutationsForServer,
} = offlineMutationsSlice.actions;

export default offlineMutationsSlice.reducer;
