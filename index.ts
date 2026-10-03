import { registerRootComponent } from 'expo';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

import App from './App';

// Reanimated's "strict mode" logger (default on since Reanimated 3.16) warns
// on any `.value` read outside a worklet/useDerivedValue/event-handler - a
// real diagnostic, but @shopify/react-native-skia's own useRectBuffer/
// useRSXformBuffer (atlas.ts, ItemLayer.tsx's AnimatedSprite - every
// animated tile/item sprite) calls Reanimated's low-level `startMapper`
// straight in its hook body rather than inside a useEffect
// (node_modules/@shopify/react-native-skia/.../external/reanimated/
// buffers.js), which Reanimated's strict check can't tell apart from a real
// render-time violation - a known cross-library false positive (see
// Reanimated's own issue tracker for the same class of report against other
// libraries, e.g. gorhom/react-native-bottom-sheet#1983). Confirmed nothing
// in this app's own code triggers it - every `.value` read here was audited
// and is already inside a worklet/useDerivedValue/useEffect/event handler.
// Keeping `level: warn` (not silencing real warnings/errors), only turning
// off the extra strict-mode class of check this specific false positive
// belongs to - see
// https://docs.swmansion.com/react-native-reanimated/docs/debugging/logger-configuration
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
