import { persistStore } from 'redux-persist';
import store from './store';

/**
 * Starts redux-persist for the app store: rehydrates it and begins writing it.
 *
 * Its own module, apart from `store.ts`, because `persistStore` starts write
 * timers the moment it runs. A test that only needed the store's reducers used
 * to start them by importing `store.ts`, and a jest worker then could not exit
 * ("A worker process has failed to exit gracefully"). Only the app root, which
 * gates rendering on rehydration, imports this.
 */
export const persistor = persistStore(store);
