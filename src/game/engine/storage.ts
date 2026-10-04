import {
  userDefaultsGet,
  userDefaultsSet,
} from "react-native-device-activity";

/**
 * The only file that reads/writes our own persisted blobs. Everything goes
 * through the library's `userDefaultsSet`/`userDefaultsGet` - the same
 * shared-app-group UserDefaults the native extensions themselves read and
 * write (see CLAUDE.md) - rather than AsyncStorage/MMKV, so there's no new
 * native dependency and (if it ever mattered) the data lives somewhere the
 * extensions could theoretically read too.
 *
 * Values are JSON strings under versioned keys (`mindscape.v1.*`) - bump the
 * version suffix on a breaking shape change rather than writing a migration;
 * this app has never shipped, so there's no real data to migrate yet, and a
 * bumped key just means `get` legitimately returns `undefined` once, which
 * every `get` call already has to handle anyway.
 */
const KEY_PREFIX = "mindscape.v1.";

export function getJSON<T>(key: string): T | undefined {
  const raw = userDefaultsGet<string>(KEY_PREFIX + key);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt/partial write should never crash startup - treat it as
    // "nothing was ever saved" and let the caller fall back to a default.
    return undefined;
  }
}

export function setJSON<T>(key: string, value: T): void {
  userDefaultsSet(KEY_PREFIX + key, JSON.stringify(value));
}

export const StorageKeys = {
  engineState: "engineState",
  wallet: "wallet",
  walletLedger: "walletLedger",
  removedScenery: "removedScenery",
} as const;
