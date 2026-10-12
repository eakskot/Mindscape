/**
 * User-facing copy - tab/screen titles, Appearance settings, and the Village
 * overlay (TodayCard, StreakBadge, edit controls). Kept in one place so wording can be
 * tuned (or translated later) without hunting through components.
 */
export const strings = {
  /** Tab and screen titles (re-exported as `theme.labels` for the tab bar). */
  labels: {
    village: "Village",
    shop: "Shop",
    focus: "Focus",
    screentime: "Screen time",
    profile: "Profile",
    settings: "Settings",
    friendsComingSoon: "Friends - coming soon",
  },
  appearance: {
    section: "Appearance",
    light: "Light",
    dark: "Dark",
    system: "System",
    darkModeToggle: "Dark mode",
  },
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
  },
  streak: {
    accessibility: (days: number) => `${days} day streak`,
  },
  edit: {
    editVillage: "Edit village",
    done: "Done",
  },
} as const;
