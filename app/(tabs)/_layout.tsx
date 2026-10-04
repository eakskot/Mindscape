import { Tabs } from "expo-router";

import { TabBar } from "../../src/ui/TabBar/TabBar";

/**
 * The tab navigator. Which screens exist here must match the `route` values
 * in tabs.config.ts - TabBar.tsx looks each one up by name against this
 * list's routes at render time.
 *
 * `tabBar` replaces the default bottom-tabs chrome entirely with the custom
 * one - see TabBar.tsx for the visual spec and why taps on it can't reach
 * the world underneath.
 *
 * Mounting: @react-navigation/bottom-tabs keeps a screen mounted (hidden,
 * not unmounted) after its first focus - switching tabs does not reset the
 * Village screen's wallet, placed items or removed scenery for exactly that
 * reason. No `unmountOnBlur` anywhere here - don't add it without re-reading
 * CLAUDE.md's "Current state" first.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="shop" />
      <Tabs.Screen name="screentime" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
