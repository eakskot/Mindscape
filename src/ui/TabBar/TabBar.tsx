import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_ENTRIES, type ActionEntry, type TabEntry } from "./tabs.config";
import { theme } from "./theme";

/**
 * The exact slice of @react-navigation/bottom-tabs' `BottomTabBarProps` this
 * component reads - typed locally rather than importing that package's types
 * (a transitive dependency of expo-router, not one of ours) so this file
 * doesn't depend on its exact version. expo-router's <Tabs tabBar={...}>
 * passes the real thing, which is a structural superset of this.
 */
type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: {
    navigate: (name: string) => void;
    // `type` is the literal "tabPress" (the only event this file emits),
    // not a plain `string` - the real emit's `type` param is a `keyof`
    // union of its event map, and a narrower literal here is what makes
    // this structurally assignable from that real (wider) function type.
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
  };
};

/**
 * The custom tab bar passed to expo-router's <Tabs> (see
 * app/(tabs)/_layout.tsx). Dark, rounded-top, full-bleed over the world,
 * floating the center Focus button above its own top edge - see the mockup
 * this was built against. Pixel art stays in the world only; this is clean
 * native-feeling chrome (theme.ts).
 *
 * Order and content come entirely from `TAB_BAR_ENTRIES` - this file never
 * hardcodes which tabs exist, only how an entry of each `kind` draws and
 * behaves.
 *
 * Touches: the bar (and the Focus button poking above it) are the only
 * touchable things here - everything else in `wrapper`'s extra height is
 * `pointerEvents="box-none"`, so a tap just above the bar that misses the
 * Focus button falls through to the world underneath, exactly as if this
 * component weren't there. The bar itself is a sibling rendered after (so,
 * on top of) the active screen's content in the navigator's tree - RN's
 * touch responder system hands a touch to whichever view it hits first, so
 * it never reaches the world's PanResponder underneath.
 */
/** The bar's own bottom padding - the safe-area inset, with a floor for devices without one. */
function useBarBottomPadding() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12);
}

/**
 * How much of the screen's bottom edge the tab bar visually covers,
 * including the Focus button's overhang above the bar's top edge
 * (`playButtonLift` minus the bar's own `paddingTop`). The bar is
 * absolutely positioned over the screen (see `styles.wrapper`), so anything
 * a tab screen pins to its bottom (e.g. TodayCard) needs this as its offset.
 * Computed from the same constants the bar draws with rather than measured,
 * since `useBottomTabBarHeight` isn't reachable from this custom bar
 * without depending on @react-navigation/bottom-tabs directly.
 */
export function useTabBarHeight() {
  return (
    theme.sizes.barHeight +
    useBarBottomPadding() +
    (theme.sizes.playButtonLift - BAR_PADDING_TOP)
  );
}

const BAR_PADDING_TOP = 8;

export function TabBar({ state, navigation }: TabBarProps) {
  const bottomPadding = useBarBottomPadding();

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          { height: theme.sizes.barHeight + bottomPadding, paddingBottom: bottomPadding },
        ]}
      >
        {TAB_BAR_ENTRIES.map((entry) => {
          if (entry.kind === "action") {
            return <FocusButton key={entry.id} entry={entry} />;
          }

          const routeIndex = state.routes.findIndex((route) => route.name === entry.route);
          if (routeIndex === -1) {
            // A route file for this entry hasn't been created yet - fail
            // quiet rather than crash the bar over one missing screen.
            return null;
          }
          const route = state.routes[routeIndex];
          const focused = state.index === routeIndex;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return <TabButton key={entry.id} entry={entry} focused={focused} onPress={onPress} />;
        })}
      </View>
    </View>
  );
}

function TabButton({
  entry,
  focused,
  onPress,
}: {
  entry: TabEntry;
  focused: boolean;
  onPress: () => void;
}) {
  // 0 -> 1 as a tab becomes active. Drives the active icon's crossfade, the
  // label color and the accent underline together, all off one value.
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: theme.motion.tabSwitchMs });
  }, [focused, progress]);

  // Crossfading two stacked icons (grey base, white overlay whose opacity is
  // `progress`) rather than animating the Feather glyph's own `color` prop -
  // robust regardless of how @expo/vector-icons merges an animated `style`
  // into its internal Text, unlike animating `color` through it directly.
  const activeIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + progress.value * 0.4,
  }));
  const accentStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: 0.4 + progress.value * 0.6 }],
  }));

  return (
    <Pressable
      style={styles.tabButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={entry.label}
      hitSlop={6}
    >
      <View style={styles.iconStack}>
        <Feather name={entry.icon} size={theme.sizes.iconSize} color={theme.colors.iconInactive} />
        <Animated.View style={[StyleSheet.absoluteFill, activeIconStyle]}>
          <Feather name={entry.icon} size={theme.sizes.iconSize} color={theme.colors.iconActive} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.label, labelStyle, focused && styles.labelActive]}>
        {entry.label}
      </Animated.Text>
      <Animated.View style={[styles.accentUnderline, accentStyle]} />
    </Pressable>
  );
}

function FocusButton({ entry }: { entry: ActionEntry }) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, theme.motion.playPressSpring);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, theme.motion.playPressSpring);
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // A modal, not a tab - see CLAUDE.md "Where this is going" #4 and
    // app/_layout.tsx's root Stack.
    router.push("/focus");
  };

  return (
    <View style={styles.actionSlot} pointerEvents="box-none">
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={entry.label}
        style={styles.playTouchTarget}
      >
        <Animated.View style={[styles.playButton, pressStyle]}>
          <Feather name={entry.icon} size={theme.sizes.playIconSize} color={theme.colors.playIcon} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // Tall enough that the Focus button's lift above the bar still sits
    // inside this box (and therefore still receives its own touches) -
    // everything in this extra strip that isn't the button itself stays
    // box-none (see the component doc comment).
    height: theme.sizes.barHeight + theme.sizes.playButtonLift + 40,
    justifyContent: "flex-end",
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: BAR_PADDING_TOP,
    backgroundColor: theme.colors.barBackground,
    borderTopLeftRadius: theme.radii.barTop,
    borderTopRightRadius: theme.radii.barTop,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.barBorder,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  iconStack: {
    width: theme.sizes.iconSize,
    height: theme.sizes.iconSize,
  },
  label: {
    fontSize: theme.sizes.labelSize,
    color: theme.colors.labelInactive,
  },
  labelActive: {
    color: theme.colors.labelActive,
    fontWeight: "600",
  },
  accentUnderline: {
    marginTop: 1,
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  actionSlot: {
    flex: 1,
    alignItems: "center",
  },
  playTouchTarget: {
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: theme.sizes.playButtonSize,
    height: theme.sizes.playButtonSize,
    borderRadius: theme.radii.playButton,
    marginTop: -theme.sizes.playButtonLift,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
