import { createMMKV } from 'react-native-mmkv';
import { Storage } from 'redux-persist';

/**
 * Two stores, deliberately separate.
 *
 * Redux holds small durable client state — playback resume position, settings,
 * wants. TanStack Query holds the server catalog. They have different sizes,
 * different lifetimes and different reasons to be cleared: dropping a stale
 * catalog should never risk a user's settings, and one instance made that a
 * single blast radius.
 *
 * Both live in a namespace of their own for this architecture. Nothing reads
 * the previous namespace: the rewrite changed what every persisted record
 * looks like, so a value carried over would be a value in a shape no reader
 * now understands. Users reconnect and re-sync once, and the old namespace is
 * left untouched so a rollback finds its state exactly as it was.
 */
const NAMESPACE = 'yuzic-v2';

const reduxMmkv = createMMKV({ id: `${NAMESPACE}-redux` });
const queryMmkv = createMMKV({ id: `${NAMESPACE}-query` });

/** Kept for the few modules that store their own small values directly. */
export const mmkv = reduxMmkv;

const storageFor = (store: ReturnType<typeof createMMKV>) => ({
  setItem: (key: string, value: string): Promise<void> => {
    store.set(key, value);
    return Promise.resolve();
  },
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(store.getString(key) ?? null),
  removeItem: (key: string): Promise<void> => {
    store.remove(key);
    return Promise.resolve();
  },
});

export const reduxStorage: Storage = {
  ...storageFor(reduxMmkv),
  // redux-persist wants a truthy resolution from setItem.
  setItem: (key: string, value: string) => {
    reduxMmkv.set(key, value);
    return Promise.resolve(true);
  },
};

/** The persister for the query cache. Named for what it is, not for AsyncStorage. */
export const queryCacheStorage = storageFor(queryMmkv);
