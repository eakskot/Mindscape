import { Text, View } from "react-native";

import { floatingSurface, makeStyles } from "../../ui/theme";

type CurrencyHudProps = {
  balance: number;
};

/**
 * The balance badge - presentational only, HomeScreen owns the wallet (see
 * useWallet.ts) and passes the number down, the same split DevInventory
 * uses for edit mode. `pointerEvents="none"` since it's a read-out, not a
 * button - it must never steal a touch from the world view underneath it.
 *
 * Not positioned itself - HomeScreen.tsx places it in a row next to
 * `StreakBadge` (see engine/StreakBadge.tsx), both under one absolutely
 * positioned wrapper (`topRightRow`). Used to carry its own `top: 56,
 * right: 12`; that offset lives on the wrapper now.
 */
export const CurrencyHud = ({ balance }: CurrencyHudProps) => {
  const styles = useStyles();
  return (
    <View style={styles.root} pointerEvents="none">
      <Text style={styles.icon}>🪙</Text>
      <Text style={styles.balance}>{balance}</Text>
    </View>
  );
};

const useStyles = makeStyles((c) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    ...floatingSurface(c),
  },
  icon: {
    fontSize: 14,
  },
  balance: {
    color: c.coin,
    fontSize: 14,
    fontWeight: "600",
  },
}));
