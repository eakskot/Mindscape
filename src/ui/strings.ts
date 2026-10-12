/**
 * User-facing copy for the Village (home) screen's overlay UI - TodayCard,
 * StreakBadge and the edit controls. Kept in one place so wording can be
 * tuned (or translated later) without hunting through components. Tab and
 * screen titles still live in `TabBar/theme.ts`'s `labels`.
 */
export const strings = {
  today: {
    notSetUp: "Lock your brainrot apps",
    setUpAction: "Set up",
    locked: (ticketsLeft: number) =>
      `Apps locked · ${ticketsLeft} ${ticketsLeft === 1 ? "ticket" : "tickets"} left`,
    useTicketAction: "Use a ticket",
    ticketActive: (countdown: string) => `Ticket active · ${countdown}`,
    cooldown: (countdown: string) => `Next ticket in ${countdown}`,
    outOfTickets: (resetHour: string) => `No tickets left today · resets at ${resetHour}`,
    focus: (countdown: string) => `Focus session · ${countdown}`,
    goal: (name: string, balance: number, price: number) =>
      `Next goal: ${name} · ${balance}/${price}`,
    canAfford: (name: string) => `You can afford ${name}`,
  },
  streak: {
    accessibility: (days: number) => `${days} day streak`,
  },
  edit: {
    editVillage: "Edit village",
    done: "Done",
  },
} as const;
