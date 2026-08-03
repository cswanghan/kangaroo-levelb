#!/usr/bin/env python3
"""For image-only PDF pages, find natural Y-splits using whitespace bands.

Renders page at SCALE=3, converts to grayscale, finds runs of pure-white
rows (>=N consecutive rows where all pixels are >=240). Reports start/end
of each non-whitespace band — useful for hand-picking y0 splits for
hardcoded crops on scanned PDFs.
"""
import fitz, sys
from pathlib import Path
from PIL import Image
import numpy as np

BASE = Path(__file__).resolve().parent.parent
SCALE = 3

def find_bands(page, min_gap=60):
    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE,SCALE))
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("L")
    a = np.array(img)
    is_white = (a.min(axis=1) >= 240) | (a.mean(axis=1) >= 252)
    # find runs of whitespace
    bands = []  # (start, end) of content blocks in pixel rows
    in_content = False
    start = 0
    gap = 0
    for i, w in enumerate(is_white):
        if w:
            if in_content:
                gap += 1
                if gap >= min_gap:
                    bands.append((start, i - gap))
                    in_content = False
                    gap = 0
        else:
            if not in_content:
                start = i
                in_content = True
            gap = 0
    if in_content:
        bands.append((start, len(is_white)-1))
    return bands, pix.height

def main():
    year = int(sys.argv[1])
    page_idx = int(sys.argv[2])
    pdf = BASE / "public" / "papers" / f"{year} 等级2：3-4年级.pdf"
    if not pdf.exists():
        pdf = BASE / "public" / "papers" / f"{year} 等级B：3-4年级.pdf"
    doc = fitz.open(pdf)
    page = doc[page_idx]
    bands, h = find_bands(page)
    print(f"{year} page {page_idx} (rendered h={h}px @ scale {SCALE}, PDF h={page.rect.height:.0f}pt)")
    for s, e in bands:
        pdf_top = s / SCALE
        pdf_bot = e / SCALE
        print(f"  band px[{s:5d}..{e:5d}]  PDFy[{pdf_top:6.1f}..{pdf_bot:6.1f}]  height={e-s}px")

if __name__ == "__main__":
    main()
