import type { ComponentProps } from "react";
import type { Feather } from "@expo/vector-icons";

import { theme } from "./theme";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

/** A real tab: backed by a route file under app/(tabs)/. */
export type TabEntry = {
  id: string;
  kind: "tab";
  label: string;
  icon: FeatherIconName;
  /** Must match that route's file name (the `name` on its <Tabs.Screen>). */
  route: string;
};

/** The center button: not a tab, opens a modal instead of switching screens. */
export type ActionEntry = {
  id: string;
  kind: "action";
  label: string;
  icon: FeatherIconName;
};

export type TabBarEntry = TabEntry | ActionEntry;

/**
 * The bottom bar, left to right, in one place. Adding a tab is a one-line
 * add here plus a route file under app/(tabs)/ - TabBar.tsx and
 * app/(tabs)/_layout.tsx both derive from this array, nothing else branches
 * on which tabs exist.
 *
 * No Friends tab yet - needs a backend (see CLAUDE.md "Where this is
 * going" #4). A disabled "Friends - coming soon" row lives on Profile
 * instead until there's something real behind it.
 */
export const TAB_BAR_ENTRIES: TabBarEntry[] = [
  { id: "village", kind: "tab", label: theme.labels.village, icon: "map", route: "index" },
  { id: "shop", kind: "tab", label: theme.labels.shop, icon: "shopping-bag", route: "shop" },
  { id: "focus", kind: "action", label: theme.labels.focus, icon: "play" },
  {
    id: "screentime",
    kind: "tab",
    label: theme.labels.screentime,
    icon: "clock",
    route: "screentime",
  },
  { id: "profile", kind: "tab", label: theme.labels.profile, icon: "user", route: "profile" },
];
