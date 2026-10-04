import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { getJSON, setJSON, StorageKeys } from "../engine/storage";
import { ECONOMY } from "./economyConfig";
import { useWallet, type LedgerEntry } from "./useWallet";

type WalletApi = ReturnType<typeof useWallet>;

/**
 * Lifts `useWallet()` above the navigator so it survives a tab switch (see
 * HomeScreen.tsx's history) - now also persisted, hydrated synchronously
 * before first render so the balance is never seen snapping from 100 to its
 * real value.
 *
 * Identical runtime API to `useWallet()` itself - this is purely a "where
 * it lives + does it survive a restart" change, not a "how it works" one.
 */
const WalletContext = createContext<WalletApi | null>(null);

type PersistedWallet = { balance: number };

export function WalletProvider({ children }: { children: ReactNode }) {
  // useMemo (not useState(() => ...)) would still only run once per mount,
  // but the intent here is specifically "read synchronously before the
  // first render that needs it" - matches the synchronous userDefaultsGet
  // underneath, see storage.ts.
  const hydrated = useMemo(() => {
    const saved = getJSON<PersistedWallet>(StorageKeys.wallet);
    const ledger = getJSON<LedgerEntry[]>(StorageKeys.walletLedger);
    return {
      balance: saved?.balance ?? ECONOMY.STARTING_BALANCE,
      ledger: ledger ?? [],
    };
  }, []);

  const wallet = useWallet(hydrated.balance, hydrated.ledger);

  useEffect(() => {
    setJSON<PersistedWallet>(StorageKeys.wallet, { balance: wallet.balance });
  }, [wallet.balance]);

  useEffect(() => {
    setJSON(StorageKeys.walletLedger, wallet.ledger);
  }, [wallet.ledger]);

  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWalletContext(): WalletApi {
  const wallet = useContext(WalletContext);
  if (!wallet) {
    throw new Error("useWalletContext must be used within a WalletProvider (see app/_layout.tsx)");
  }
  return wallet;
}
