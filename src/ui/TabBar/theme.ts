/**
 * Every visual constant the tab bar (and the screens it opens - Focus,
 * Shop, Screen time, Profile, Settings) draws from. One file so the look
 * can be tuned without hunting through components - see CLAUDE.md's tab
 * bar section.
 *
 * Deliberately a separate visual language from the world: the world is
 * LimeZu pixel art (see Asset facts in CLAUDE.md), this chrome is clean,
 * native-feeling UI - no pixel fonts, no pixel-art borders.
 */
export const theme = {
  colors: {
    barBackground: "rgba(15, 17, 21, 0.94)",
    barBorder: "rgba(255, 255, 255, 0.08)",
    iconInactive: "#8A8F98",
    iconActive: "#FFFFFF",
    labelInactive: "#8A8F98",
    labelActive: "#FFFFFF",
    accent: "#3DDC73",
    accentGlow: "rgba(61, 220, 115, 0.55)",
    playIcon: "#0F1115",
    screenBackground: "#0F1115",
    modalBackground: "#15171C",
    cardBackground: "#1C1F26",
    textPrimary: "#FFFFFF",
    textSecondary: "#8A8F98",
    textDisabled: "#4D525C",
    divider: "rgba(255, 255, 255, 0.08)",
    danger: "#FF6B6B",
  },

  radii: {
    barTop: 24,
    card: 16,
    chip: 12,
    playButton: 32, // half of sizes.playButtonSize - a perfect circle
  },

  sizes: {
    barHeight: 58,
    iconSize: 22,
    labelSize: 11,
    accentDotSize: 4,
    playButtonSize: 64,
    playIconSize: 26,
    /** How far the play button's center sits above the bar's own top edge. */
    playButtonLift: 22,
  },

  motion: {
    tabSwitchMs: 160,
    playPressSpring: { damping: 14, stiffness: 260 },
  },

  labels: {
    village: "Village",
    shop: "Shop",
    focus: "Focus",
    screentime: "Screen time",
    profile: "Profile",
    settings: "Settings",
    friendsComingSoon: "Friends - coming soon",
  },
} as const;
