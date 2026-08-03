#!/usr/bin/env python3
"""Re-crop 2020 Level B page-09 to recover missing Q21.

Root cause: PDF renders Q21 marker as '#    21  .' with extra spaces
between '#', '21', '.' — none of process_all_levels.py's 4 patterns
match it, so the script silently dropped Q21, and Q20's crop swallowed
Q21's content.
"""
import fitz
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PDF = BASE / "public" / "papers" / "2020 等级2：3-4年级.pdf"
OUT = BASE / "public" / "2020"
SCALE = 3

# 0-indexed page 8 (PDF page 9). Q20 and Q21 share this page.
PAGE_IDX = 8
PAGE_QUESTIONS = [
    {"num": 20, "y0": 91.3},
    {"num": 21, "y0": 394.8},
]

def main():
    doc = fitz.open(PDF)
    page = doc[PAGE_IDX]
    pw, ph = page.rect.width, page.rect.height
    qs = sorted(PAGE_QUESTIONS, key=lambda q: q["y0"])
    for i, q in enumerate(qs):
        top = max(0, q["y0"] - 5)
        bot = (qs[i+1]["y0"] - 2) if i + 1 < len(qs) else (ph - 25)
        clip = fitz.Rect(0, top, pw, bot)
        pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=clip)
        out = OUT / f"q{q['num']}.png"
        pix.save(str(out))
        print(f"q{q['num']}.png  y=[{top:.1f},{bot:.1f}]  -> {out}")

if __name__ == "__main__":
    main()
