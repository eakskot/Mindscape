/**
 * Design tokens. Two palettes with the exact same *semantic* keys - UI code
 * only ever asks for a role ("textSecondary", "surfaceRaised"), never a
 * color, so switching palettes recolors everything with no per-screen
 * branching. Non-color tokens (spacing, radii, type) are shared by both.
 *
 * World art (LimeZu tiles, sprites, Skia highlights) is NOT themed - it must
 * look identical in both schemes. Only UI chrome reads from here.
 *
 * Light is warm cream, sampled against the village tilesets (sand path
 * #e8da7e / #d29f51, grass #76c564, the dark outline #3a3a50 used as the
 * shadow tint). Dark is the app's original look, preserved key for key.
 * Every body-text pair is >= 4.5:1 (WCAG AA) - see CLAUDE.md for the numbers.
 */
export type Palette = {
  /** Full-screen backgrounds (tab screens). */
  bg: string;
  /** Floating cards/sheets on top of bg. */
  surface: string;
  /** Cards inside screens/modals. */
  surfaceRaised: string;
  /** Modal sheet background (Focus, Settings, Tickets, Summary). */
  modalBg: string;
  border: string;
  divider: string;
  /** HUD chips/buttons floating over the Skia world - must read on bright pixel art. */
  floatingBg: string;
  floatingBorder: string;
  shadow: string;
  /** Modal scrim. */
  overlay: string;

  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  /** Text on a surface of the opposite lightness. */
  textInverse: string;

  accent: string;
  /** Text/icons drawn on `accent`. */
  accentText: string;
  accentMuted: string;
  accentGlow: string;

  /** Text/icon danger color. */
  danger: string;
  /** Solid danger button background (+ `onSolid` text). */
  dangerSolid: string;
  /** Solid warning background (DevInventory "Moving"), + `warningText`. */
  warning: string;
  warningText: string;
  success: string;
  /** Text on dangerSolid. */
  onSolid: string;

  /** Coin balance text. */
  coin: string;
  streakFlame: string;
  streakText: string;

  tabBarBg: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
};

export const lightPalette: Palette = {
  bg: "#F6EFE2",
  surface: "#FFFBF2",
  surfaceRaised: "#FFFFFF",
  modalBg: "#F6EFE2",
  border: "#E3D8C3",
  divider: "rgba(43, 42, 38, 0.10)",
  floatingBg: "#FFFBF2",
  floatingBorder: "#E3D8C3",
  shadow: "#3A3A50",
  overlay: "rgba(43, 42, 38, 0.40)",

  textPrimary: "#2B2A26",
  textSecondary: "#6B655A",
  textDisabled: "#A39C8E",
  textInverse: "#FFFFFF",

  accent: "#287A41",
  accentText: "#FFFFFF",
  accentMuted: "#DCEFD8",
  accentGlow: "rgba(40, 122, 65, 0.35)",

  danger: "#B3261E",
  dangerSolid: "#B3261E",
  warning: "#C9971F",
  warningText: "#2B2A26",
  success: "#287A41",
  onSolid: "#FFFFFF",

  coin: "#8A5A00",
  streakFlame: "#E0701A",
  streakText: "#8A4B0F",

  tabBarBg: "rgba(255, 251, 242, 0.97)",
  tabBarBorder: "#E3D8C3",
  tabBarActive: "#2B2A26",
  tabBarInactive: "#6B655A",
};

export const darkPalette: Palette = {
  bg: "#0F1115",
  surface: "#15171C",
  surfaceRaised: "#1C1F26",
  modalBg: "#15171C",
  border: "rgba(255, 255, 255, 0.08)",
  divider: "rgba(255, 255, 255, 0.08)",
  floatingBg: "#000000cc",
  floatingBorder: "rgba(255, 255, 255, 0.10)",
  shadow: "#000000",
  overlay: "rgba(0, 0, 0, 0.55)",

  textPrimary: "#FFFFFF",
  textSecondary: "#8A8F98",
  textDisabled: "#4D525C",
  textInverse: "#0F1115",

  accent: "#3DDC73",
  accentText: "#0F1115",
  accentMuted: "rgba(61, 220, 115, 0.15)",
  accentGlow: "rgba(61, 220, 115, 0.55)",

  danger: "#FF6B6B",
  dangerSolid: "#aa3333",
  warning: "#c9971f",
  warningText: "#0F1115",
  success: "#3DDC73",
  onSolid: "#FFFFFF",

  coin: "#ffd978",
  streakFlame: "#ff9f43",
  streakText: "#ffd9b0",

  tabBarBg: "rgba(15, 17, 21, 0.94)",
  tabBarBorder: "rgba(255, 255, 255, 0.08)",
  tabBarActive: "#FFFFFF",
  tabBarInactive: "#8A8F98",
};

export const palettes = { light: lightPalette, dark: darkPalette } as const;

/** Shared by both palettes. */
export const tokens = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
  radii: {
    sm: 8,
    chip: 12,
    card: 16,
    barTop: 24,
    pill: 999,
  },
  fontSizes: { xs: 11, sm: 12, md: 14, lg: 16, xl: 20, xxl: 22 },
  /** undefined = the platform system font (SF Pro on iOS). One place to swap it. */
  fontFamily: undefined as string | undefined,
} as const;
