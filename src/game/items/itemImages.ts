import { useImage, type SkImage } from "@shopify/react-native-skia";

import { ALL_ITEMS, type ItemId } from "./itemCatalog";

export type ItemImages = Record<ItemId, SkImage | null>;

/**
 * Loads every catalog sprite once, so two beds share one decoded image.
 * The catalog is a fixed table, so the hook order never changes between renders.
 */
export const useItemImages = (): ItemImages => {
  const images = {} as ItemImages;
  for (const item of ALL_ITEMS) {
    images[item.id] = useImage(item.source);
  }
  return images;
};
