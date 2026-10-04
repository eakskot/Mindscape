import { ECONOMY } from "./economyConfig";

export type DaySettlementInput = {
  /** Was the engine armed for this day. If not, the day earns nothing and breaks the streak - it wasn't being played. */
  armed: boolean;
  ticketsUsed: number;
  ticketsPerDay: number;
  /** Whether the emergency valve was used on this day. */
  usedEmergency: boolean;
  /** The streak going into this day (i.e. as of yesterday). */
  previousStreak: number;
};

export type DaySettlementResult = {
  totalCoins: number;
  newStreak: number;
  breakdown: {
    unusedTickets: number;
    cleanDay: number;
    streakDaily: number;
    streakMilestone: number;
  };
};

const ZERO_BREAKDOWN = {
  unusedTickets: 0,
  cleanDay: 0,
  streakDaily: 0,
  streakMilestone: 0,
};

/**
 * Pure - no wallet/storage access. The caller (engineLogic.ts's reconcile)
 * applies `totalCoins` to the wallet and `newStreak` to engine state. See
 * CLAUDE.md "Where this is going" for the rules this encodes; this is
 * deliberately the only place they're encoded, so Phase 3's "does this
 * actually settle right" testing can exercise it directly with fabricated
 * inputs instead of needing to fast-forward real days.
 *
 * Not armed: the day earns nothing and the streak resets to 0 - it wasn't
 * being played, same as a day you never had the app at all.
 *
 * An emergency day pays unused-ticket bonuses normally (those are earned
 * per ticket, independent of the valve) but no clean-day bonus and no
 * streak-daily bonus or milestone - and leaves the streak counter itself
 * unchanged (neither advances nor resets), so tomorrow's streak bonus still
 * reflects yesterday's real streak once a clean day resumes it.
 */
export function settleDay(input: DaySettlementInput): DaySettlementResult {
  if (!input.armed) {
    return { totalCoins: 0, newStreak: 0, breakdown: ZERO_BREAKDOWN };
  }

  const unusedTickets =
    Math.max(0, input.ticketsPerDay - input.ticketsUsed) *
    ECONOMY.UNUSED_TICKET_BONUS;

  if (input.usedEmergency) {
    return {
      totalCoins: unusedTickets,
      newStreak: input.previousStreak,
      breakdown: { ...ZERO_BREAKDOWN, unusedTickets },
    };
  }

  const newStreak = input.previousStreak + 1;
  const cleanDay = ECONOMY.CLEAN_DAY_BONUS;
  const streakDaily =
    ECONOMY.STREAK_DAILY_BONUS_PER_DAY *
    Math.min(newStreak, ECONOMY.STREAK_DAILY_BONUS_CAP_DAYS);
  const streakMilestone = ECONOMY.STREAK_MILESTONES[newStreak] ?? 0;

  return {
    totalCoins: unusedTickets + cleanDay + streakDaily + streakMilestone,
    newStreak,
    breakdown: { unusedTickets, cleanDay, streakDaily, streakMilestone },
  };
}
