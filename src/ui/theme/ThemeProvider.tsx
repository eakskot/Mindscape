import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";

import { getJSON, setJSON, StorageKeys } from "../../game/engine/storage";
import { palettes, type Palette } from "./palettes";

export type ThemePreference = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

type ThemeContextValue = {
  palette: Palette;
  /** What's actually showing - `preference` resolved against the OS for "system". */
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const DEFAULT_PREFERENCE: ThemePreference = "light";

function loadPreference(): ThemePreference {
  const saved = getJSON<ThemePreference>(StorageKeys.themePreference);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : DEFAULT_PREFERENCE;
}

/** Pushes the preference down to native (keyboard, alerts, system sheets). "system" clears the override. */
function applyNativeOverride(preference: ThemePreference) {
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Light/dark theme. The preference is hydrated synchronously from
 * storage.ts in the `useState` initializer (and the native override applied
 * right there too), so the very first render already uses the right
 * palette - no flash of the wrong theme. Mounted at the top of
 * app/_layout.tsx, above everything that draws UI.
 *
 * "system" follows the OS live: with the native override cleared,
 * `useColorScheme()` re-renders on every OS appearance change. Needs
 * `userInterfaceStyle: "automatic"` in app.json - with "light" iOS pins the
 * whole app to light at the Info.plist level and "system"/"dark" break.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const initial = loadPreference();
    applyNativeOverride(initial);
    return initial;
  });
  const systemScheme = useColorScheme();

  useEffect(() => {
    applyNativeOverride(preference);
    setJSON(StorageKeys.themePreference, preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => setPreferenceState(next), []);

  const scheme: ColorScheme =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const value = useMemo(
    () => ({ palette: palettes[scheme], scheme, preference, setPreference }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme() must be used inside <ThemeProvider>");
  return value;
}
