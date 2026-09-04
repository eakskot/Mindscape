/**
 * Which interaction placed items are in - shared between DevInventory (the
 * buttons) and HomeScreen.tsx (the PanResponder + DragHighlight that act on
 * it), broken out to its own file so neither has to import the other just
 * for this one type.
 */
export type EditMode = "none" | "move" | "delete";
