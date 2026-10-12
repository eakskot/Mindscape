import { strings } from "../strings";
import { tokens } from "../theme/palettes";

/**
 * Tab-bar-specific layout constants (sizes, motion) plus re-exports of the
 * shared radii and screen labels. **No colors here** - every color comes
 * from the active palette via `useTheme()` / `makeStyles` (src/ui/theme/),
 * so there's exactly one theme system. See CLAUDE.md's tab bar section.
 *
 * Deliberately a separate visual language from the world: the world is
 * LimeZu pixel art (see Asset facts in CLAUDE.md), this chrome is clean,
 * native-feeling UI - no pixel fonts, no pixel-art borders.
 */
export const theme = {
  radii: {
    barTop: tokens.radii.barTop,
    card: tokens.radii.card,
    chip: tokens.radii.chip,
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

  labels: strings.labels,
} as const;
