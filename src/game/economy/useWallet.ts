import { useCallback, useRef, useState } from "react";

import { ECONOMY } from "./economyConfig";

/**
 * The player's spendable currency.
 *
 * Persisted now (see WalletContext.tsx, which hydrates `initialBalance`/
 * `initialLedger` from storage.ts synchronously at startup and saves on
 * every change) - this hook itself still knows nothing about storage,
 * same separation as before.
 *
 * Deliberately source-agnostic, per CLAUDE.md's "Where this is going":
 * `accrue` takes a `source` tag (daily settlement, focus, the one-time
 * bonuses, etc. - see engineLogic.ts) but isn't wired to any one mechanism.
 * `spend` is likewise generic - its callers are HomeScreen.tsx's
 * `tryRemoveScenery` and (eventually) the Shop.
 *
 * Reads/writes go through a ref, not just the `balance` state - two calls
 * made in the same tick must not both see the pre-change balance.
 * `setBalance`/`setLedger` still run every time, so React re-renders
 * normally.
 */
export type WalletSource = string;

export type LedgerEntry = { t: number; amount: number; source: WalletSource };

const MAX_LEDGER_ENTRIES = 100;

export const useWallet = (
  initialBalance: number = ECONOMY.STARTING_BALANCE,
  initialLedger: LedgerEntry[] = [],
) => {
  const [balance, setBalance] = useState(initialBalance);
  const balanceRef = useRef(balance);
  const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger);

  const pushLedger = useCallback((amount: number, source: WalletSource) => {
    setLedger((current) => {
      const next = [...current, { t: Date.now(), amount, source }];
      return next.length > MAX_LEDGER_ENTRIES
        ? next.slice(next.length - MAX_LEDGER_ENTRIES)
        : next;
    });
  }, []);

  const accrue = useCallback(
    (amount: number, source: WalletSource) => {
      if (amount <= 0) return;
      balanceRef.current += amount;
      setBalance(balanceRef.current);
      pushLedger(amount, source);
    },
    [pushLedger],
  );

  /** Returns whether the spend succeeded - false if funds were insufficient. */
  const spend = useCallback(
    (amount: number, source: WalletSource = "spend") => {
      if (amount <= 0 || balanceRef.current < amount) return false;
      balanceRef.current -= amount;
      setBalance(balanceRef.current);
      pushLedger(-amount, source);
      return true;
    },
    [pushLedger],
  );

  return { balance, accrue, spend, ledger };
};
