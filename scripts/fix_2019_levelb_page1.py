#!/usr/bin/env python3
"""Re-crop 2019 Level B page-01 questions (Q1-Q4).

Root cause: process_all_levels.py mis-detected '8.' inside Q2's stem
('8. Which picture stands for 12 ?') as Q8 marker, polluting sort order
and shifting Q1-Q4 crop boundaries.

Fix: hard-code true y0 positions read from the PDF and re-render.
"""
import fitz
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PDF = BASE / "public" / "papers" / "2019 等级2：3-4年级.pdf"
OUT = BASE / "public" / "2019"
SCALE = 3

# True (y0) of each question marker on page 0, from PDF text layout.
# Q4 wraps onto page 02; crop to page bottom on page 01.
PAGE0_QUESTIONS = [
    {"num": 1, "y0": 229.7},
    {"num": 2, "y0": 469.4},
    {"num": 3, "y0": 612.9},
    {"num": 4, "y0": 705.7},
]

def main():
    doc = fitz.open(PDF)
    page = doc[0]
    pw, ph = page.rect.width, page.rect.height
    qs = sorted(PAGE0_QUESTIONS, key=lambda q: q["y0"])
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
