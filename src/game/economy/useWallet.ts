import { useCallback, useRef, useState } from "react";

/**
 * The player's spendable currency.
 *
 * Not persisted yet - `balance` resets to `STARTING_BALANCE` on every app
 * restart, same as every other piece of state in this app (placed items,
 * camera, scene) until a persistence layer exists. Not a limitation specific
 * to this feature.
 *
 * Deliberately source-agnostic, per CLAUDE.md's "Where this is going":
 * `accrue` takes a `source` tag (for future bookkeeping/analytics, unused for
 * now) but isn't wired to any one mechanism. A daily check-in, a timer, and
 * eventually a Screen-Time threshold event should all just be able to call
 * `accrue` without this hook changing. `spend` is likewise generic - its
 * first real caller is HomeScreen.tsx's `tryRemoveScenery` (removing a tree
 * costs a flat amount), but nothing here is specific to that; the next thing
 * that needs to charge the player has a real, correct place to do it rather
 * than reinventing balance bookkeeping inline.
 *
 * Reads/writes go through a ref, not just the `balance` state - two `spend`
 * calls made in the same tick (unlikely today, but this is exactly the kind
 * of bug that's cheap to avoid up front) must not both see the pre-spend
 * balance. `setBalance` still runs every time, so React re-renders normally.
 */
const STARTING_BALANCE = 100;

export type WalletSource = string;

export const useWallet = () => {
  const [balance, setBalance] = useState(STARTING_BALANCE);
  const balanceRef = useRef(balance);

  const accrue = useCallback((amount: number, _source: WalletSource) => {
    if (amount <= 0) return;
    balanceRef.current += amount;
    setBalance(balanceRef.current);
  }, []);

  /** Returns whether the spend succeeded - false if funds were insufficient. */
  const spend = useCallback((amount: number) => {
    if (amount <= 0 || balanceRef.current < amount) return false;
    balanceRef.current -= amount;
    setBalance(balanceRef.current);
    return true;
  }, []);

  return { balance, accrue, spend };
};
