#!/usr/bin/env python3
"""Rebuild the v2 web fonts. Needs `pip install fonttools brotli`.

Usage: python3 subset.py <dir with the @fontsource latin files> <out dir>
Sources: alegreya-latin-wght-{normal,italic}.woff2, alegreya-sans-latin-{400,700}-normal.woff2
(as committed in "hero ... (self-hosted Alegreya)").

Scope: German and English text. A character outside CHARS falls back per glyph to the next family.
A new weight or style in the v2 CSS needs a new entry here and in ../fonts.ts.
"""
import io
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.scaleUpem import scale_upem
from fontTools.varLib import instancer

# Printable ASCII without symbols no Alegreya text uses (code is set in the system monospace).
ASCII = "".join(c for c in map(chr, range(0x20, 0x7F)) if c not in "<>\\^`{|}~$")
CHARS = ASCII + " ÄÖÜäöüßé§°·×–—‘’‚“”„•…‹›«»€−"

# output: (source, variable weight instance or None)
FONTS = {
    "alegreya-subset-wght-normal.woff2": ("alegreya-latin-wght-normal.woff2", (400, 400, 700)),
    "alegreya-subset-400-italic.woff2": ("alegreya-latin-wght-italic.woff2", 400),
    "alegreya-sans-subset-400-normal.woff2": ("alegreya-sans-latin-400-normal.woff2", None),
    "alegreya-sans-subset-700-normal.woff2": ("alegreya-sans-latin-700-normal.woff2", None),
}


def build(source: str, weight, target: str) -> None:
    font = TTFont(source)
    options = subset.Options()
    options.layout_features = ["kern"]
    options.hinting = False
    options.notdef_outline = True
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keeps copyright and licence
    options.drop_tables += ["STAT", "DSIG", "meta"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=CHARS)
    subsetter.subset(font)
    if weight is not None:
        font = instancer.instantiateVariableFont(font, {"wght": weight})
    # 500 units per em: under 0.2 px rounding at the largest display size, about 12 % smaller.
    buffer = io.BytesIO()
    font.flavor = None
    font.save(buffer)
    buffer.seek(0)
    font = TTFont(buffer)
    scale_upem(font, 500)
    font.flavor = "woff2"
    font.save(target)


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    for name, (source, weight) in FONTS.items():
        path = os.path.join(out, name)
        build(os.path.join(src, source), weight, path)
        print(name, os.path.getsize(path))
