#!/usr/bin/env python3
"""
Cuts placeable house sprites out of the Serene Village Houses tileset.

    python3 scripts/extract-houses.py

The tileset ships 6 complete red-roofed houses plus loose blue/green roof
pieces meant to be laid over a red house's walls. This script:
  1. crops each complete house (tight alpha bounds inside a hand-picked box),
  2. for every loose roof piece, finds the house whose top rows have the
     *same silhouette* (alpha mask, small horizontal search) and composites
     the roof over that house - only pairs that match are emitted, so a
     roof never lands on a house shape it wasn't drawn for,
  3. writes src/assets/sprites/houses/<id>.png, and
  4. writes src/game/items/houseItems.generated.ts - one item-catalog entry
     per house, with a measured footprint (the building's lower body, down to
     the bottom of its stone foundation - porch steps excluded, so you can
     walk up to the door).

Boxes are in tileset pixels (generous - the tight bounds are recomputed).
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "src/assets/tiles/Houses_TILESET_B-C-D-E.png")
OUT_DIR = os.path.join(ROOT, "src/assets/sprites/houses")
OUT_TS = os.path.join(ROOT, "src/game/items/houseItems.generated.ts")

# How much of the sprite height, measured up from the foundation's bottom,
# counts as solid ground footprint (the rest is roof you can walk behind).
FOOTPRINT_HEIGHT_FRACTION = 0.45

HOUSES = {
    "small_a": (48, 16, 192, 192),
    "small_b": (192, 16, 336, 192),
    "wide": (16, 200, 224, 376),
    "tall": (248, 184, 376, 376),
    "corner": (384, 96, 616, 280),
    "corner_big": (392, 384, 616, 568),
}
ROOFS = {
    "red_wide": (16, 392, 224, 488),
    "blue_wide_a": (16, 488, 224, 584),
    "blue_wide_b": (16, 584, 224, 680),
    "green_wide": (16, 680, 224, 768),
    "green_wide_top": (400, 8, 608, 96),
    "green_tall": (248, 384, 376, 480),
    "blue_tall": (248, 480, 376, 576),
    "green_small_a": (624, 16, 768, 104),
    "green_small_b": (624, 112, 768, 200),
    "blue_small_a": (240, 592, 384, 680),
    "blue_small_b": (240, 688, 384, 768),
    "blue_corner": (392, 288, 568, 384),
    "green_corner": (576, 288, 760, 384),
    "blue_corner_big": (400, 576, 616, 672),
    "green_corner_big": (400, 672, 616, 768),
}


def tight(sheet, box):
    crop = sheet.crop(box)
    bbox = crop.getbbox()
    return crop.crop(bbox), (box[0] + bbox[0], box[1] + bbox[1])


def mask(img, w, h, ox=0):
    """Alpha mask of img's top `h` rows, shifted by ox, as a set of (x, y)."""
    px = img.load()
    out = set()
    for y in range(min(h, img.height)):
        for x in range(img.width):
            if px[x, y][3] > 0:
                out.add((x + ox, y))
    return out


def color_of(img):
    r = g = b = n = 0
    for p in img.getdata():
        if p[3] > 0:
            r += p[0]; g += p[1]; b += p[2]; n += 1
    return (r / n, g / n, b / n)


def main():
    sheet = Image.open(SRC).convert("RGBA")
    os.makedirs(OUT_DIR, exist_ok=True)
    houses = {k: tight(sheet, b)[0] for k, b in HOUSES.items()}
    results = []

    # Identical duplicates (e.g. two copies of the same small house) are dropped.
    unique = {}
    for k, img in houses.items():
        if any(list(img.getdata()) == list(o.getdata()) for o in unique.values()):
            print(f"skip {k}: identical to another house", file=sys.stderr)
            continue
        unique[k] = img
    for k, img in unique.items():
        results.append((f"house_{k}_red", img))

    for rk, rbox in ROOFS.items():
        roof, _ = tight(sheet, rbox)
        cr, cg, cb = color_of(roof)
        colour = "blue" if cb > cr and cb > cg else "green" if cg > cr else "red"
        if colour == "red":
            continue  # the red loose roofs are the houses' own - nothing new to make
        best = None
        for hk, house in unique.items():
            for ox in range(-6, 7):
                left = (house.width - roof.width) // 2 + ox
                if left < -2 or left + roof.width > house.width + 2:
                    continue
                hm = mask(house, house.width, roof.height)
                rm = mask(roof, roof.width, roof.height, left)
                inter = len(hm & rm)
                union = len(hm | rm)
                score = inter / union if union else 0
                if best is None or score > best[0]:
                    best = (score, hk, left)
        score, hk, left = best
        if score < 0.97:
            print(f"skip roof {rk}: best match {hk} only {score:.3f}", file=sys.stderr)
            continue
        house = unique[hk]
        out = house.copy()
        # Clear the house's own roof rows under the new roof's footprint, then lay the roof in.
        px = out.load()
        rpx = roof.load()
        for y in range(roof.height):
            for x in range(roof.width):
                hx = x + left
                if 0 <= hx < out.width and rpx[x, y][3] > 0:
                    px[hx, y] = rpx[x, y]
        name = f"house_{hk}_{colour}"
        if any(n == name for n, _ in results):
            name = f"{name}_{rk.split('_')[-1]}"
        results.append((name, out))
        print(f"roof {rk} -> {hk} (iou {score:.3f}, offset {left})", file=sys.stderr)

    entries = []
    for name, img in results:
        img.save(os.path.join(OUT_DIR, f"{name}.png"))
        fp = footprint(img)
        entries.append((name, img.width, img.height, fp))
        print(f"{name}: {img.width}x{img.height} footprint {fp}")
    write_ts(entries)


def footprint(img):
    """Bottom row whose opaque span covers >= 80% of the width = the foundation's bottom edge."""
    px = img.load()
    w, h = img.size
    for y in range(h - 1, -1, -1):
        xs = [x for x in range(w) if px[x, y][3] > 0]
        if xs and xs[-1] - xs[0] + 1 >= 0.8 * w:
            left, right, bottom = xs[0], xs[-1], y
            break
    height = round(h * FOOTPRINT_HEIGHT_FRACTION)
    top = bottom + 1 - height
    return {"x": left + 2, "y": top, "width": right - left + 1 - 4, "height": height}


SHAPE_LABEL = {
    "small_a": "Small", "small_b": "Small", "wide": "Wide", "tall": "Tall",
    "corner": "Corner", "corner_big": "Big corner",
}


def label_for(name):
    # house_<shape>_<colour>[_<variant>]
    parts = name[len("house_"):].split("_")
    for shape in sorted(SHAPE_LABEL, key=len, reverse=True):
        sp = shape.split("_")
        if parts[: len(sp)] == sp:
            rest = parts[len(sp):]
            colour = rest[0]
            extra = " II" if (shape == "small_b" or len(rest) > 1) else ""
            return f"{SHAPE_LABEL[shape]} {colour} house{extra}"
    return name


def write_ts(entries):
    lines = [
        "/**",
        " * GENERATED by scripts/extract-houses.py - re-run it, don't hand-edit.",
        " * Placeable houses cut from the Serene Village Houses tileset. Drawn at",
        " * the map's own scale (`drawScale: 0.5` - see itemCatalog.ts), village only.",
        " */",
        'import type { ItemDefinition } from "./itemCatalog";',
        "",
        "export type HouseItemId =",
    ]
    lines += [f'  | "{name}"' for name, *_ in sorted(entries)]
    lines[-1] += ";"
    lines += ["", "export const HOUSE_ITEMS: Record<HouseItemId, ItemDefinition> = {"]
    for name, w, h, fp in sorted(entries):
        lines += [
            f"  {name}: {{",
            f'    id: "{name}",',
            f'    label: "{label_for(name)}",',
            f'    source: require("../../assets/sprites/houses/{name}.png"),',
            f"    width: {w},",
            f"    height: {h},",
            f"    footprint: {{ x: {fp['x']}, y: {fp['y']}, width: {fp['width']}, height: {fp['height']} }},",
            '    layer: "object",',
            "    solid: true,",
            "    unlocked: true,",
            "    drawScale: 0.5,",
            '    scenes: ["village"],',
            '    placement: "footprint",',
            "  },",
        ]
    lines += ["};", ""]
    with open(OUT_TS, "w") as f:
        f.write("\n".join(lines))

if __name__ == "__main__":
    main()
