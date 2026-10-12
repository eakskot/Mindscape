import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWalletContext } from "../../src/game/economy/WalletContext";
import { ALL_ITEMS, type ItemDefinition } from "../../src/game/items/itemCatalog";
import { theme } from "../../src/ui/TabBar/theme";
import { makeStyles } from "../../src/ui/theme";

/**
 * Read-only for now - no purchasing. Reads straight from `itemCatalog`
 * (see CLAUDE.md's economy section: "the eventual shop reads `balance` and
 * calls `spend` the same way; unlocking is `itemCatalog`'s job"). Every item
 * is `unlocked: true` today, so this just lists the catalog with a badge -
 * the locked/unlocked split is wired and ready for when that's no longer
 * true.
 */
export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const wallet = useWalletContext();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{theme.labels.shop}</Text>
        <View style={styles.balance}>
          <Text style={styles.balanceIcon}>🪙</Text>
          <Text style={styles.balanceText}>{wallet.balance}</Text>
        </View>
      </View>

      <FlatList
        data={ALL_ITEMS}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ShopItemCard item={item} />}
      />
    </View>
  );
}

function ShopItemCard({ item }: { item: ItemDefinition }) {
  const styles = useStyles();
  return (
    <View style={[styles.card, !item.unlocked && styles.cardLocked]}>
      <Text style={styles.cardLabel}>{item.label}</Text>
      <Text style={item.unlocked ? styles.cardUnlocked : styles.cardLockedText}>
        {item.unlocked ? "Unlocked" : "Locked"}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: c.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  balance: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radii.chip,
    backgroundColor: c.surfaceRaised,
  },
  balanceIcon: {
    fontSize: 14,
  },
  balanceText: {
    color: c.coin,
    fontSize: 14,
    fontWeight: "600",
  },
  list: {
    paddingBottom: 40,
  },
  row: {
    gap: 12,
  },
  card: {
    flex: 1,
    padding: 14,
    marginBottom: 12,
    borderRadius: theme.radii.card,
    backgroundColor: c.surfaceRaised,
  },
  cardLocked: {
    opacity: 0.5,
  },
  cardLabel: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  cardUnlocked: {
    color: c.accent,
    fontSize: 12,
  },
  cardLockedText: {
    color: c.textDisabled,
    fontSize: 12,
  },
}));
