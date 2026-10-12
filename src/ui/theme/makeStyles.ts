import { useMemo } from "react";
import { StyleSheet } from "react-native";

import { tokens, type Palette } from "./palettes";
import { useTheme } from "./ThemeProvider";

/**
 * Themed StyleSheets without recomputing per render:
 *
 *   const useStyles = makeStyles((c) => ({ root: { backgroundColor: c.bg } }));
 *   ...
 *   const styles = useStyles();
 *
 * The factory runs once per palette change (memoized on the palette object,
 * which is a stable module constant per scheme), not on every render.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (palette: Palette, t: typeof tokens) => T,
): () => T {
  return function useStyles() {
    const { palette } = useTheme();
    return useMemo(() => StyleSheet.create(factory(palette, tokens)), [palette]);
  };
}

/**
 * The shared look for UI floating over the Skia world (HUD badges, the
 * settings/edit buttons, the scenery-removal prompt, the Today card, the
 * dev inventory): a token surface + hairline border + soft shadow, so it
 * reads on bright pixel art in both themes instead of assuming a dark
 * background.
 */
export const floatingSurface = (c: Palette) =>
  ({
    backgroundColor: c.floatingBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.floatingBorder,
    shadowColor: c.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  }) as const;
