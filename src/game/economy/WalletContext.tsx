import { createContext, useContext, type ReactNode } from "react";

import { useWallet } from "./useWallet";

type WalletApi = ReturnType<typeof useWallet>;

/**
 * Lifts `useWallet()` above the navigator so it survives a tab switch - the
 * same reason HomeScreen used to own it above SceneStage (see HomeScreen.tsx
 * and CLAUDE.md). Now that the Village screen is one route among several
 * (Shop reads the balance, Screen time calls `accrue`, Focus calls `accrue`
 * on completion), it has to live above all of them instead, in the root
 * layout - see app/_layout.tsx.
 *
 * Identical API to `useWallet()` itself - this is purely a "where it lives"
 * change, not a "how it works" one.
 */
const WalletContext = createContext<WalletApi | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWalletContext(): WalletApi {
  const wallet = useContext(WalletContext);
  if (!wallet) {
    throw new Error("useWalletContext must be used within a WalletProvider (see app/_layout.tsx)");
  }
  return wallet;
}
