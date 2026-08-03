#!/usr/bin/env python3
"""Robust re-cropper for ALL Level B years.

Strategy:
  1. For each PDF, scan for question markers with a relaxed detection
     (handles '#    N  .' wide-spacing, allows x<200, dedups by smallest
     (page,y0)).
  2. For pages where markers are missing (image-only scanned pages),
     use a per-year hardcoded y-table.
  3. Re-render q*.png for every question that has a known (page,y0).
"""
import fitz, re, json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PAPERS = BASE / "public" / "papers"
IMG_ROOT = BASE / "public"
DATA = BASE / "public" / "data"
SCALE = 3

# Robust detection patterns
PATTERNS = [
    re.compile(r'^#\s*(\d{1,2})\s*[.．]'),           # "# N." with arbitrary spacing
    re.compile(r'^(\d{1,2})\s*[.．]\s*\S'),           # "N. text"
    re.compile(r'^(\d{1,2})\s*[・]\s*\S'),            # "N ・text"
    re.compile(r'^(\d{1,2})\s*[.．]\s*$'),            # standalone "N."
]

# Hardcoded fallback for image-only / scanned PDF pages
# Each entry: year -> { qnum: (page_idx_0based, y0_top, y_bottom_or_None) }
HARDCODED_Y = {
    2015: {
        # p0: Q1, Q2, Q3 (image-only) — hi-res visual inspection
        1:  (0, 75,  220),
        2:  (0, 220, 560),
        3:  (0, 560, 800),
        # p4: Q11, Q12 — from whitespace-band detection
        11: (4, 60,  280),
        12: (4, 280, 800),
        # p5: Q13, Q14
        13: (5, 60,  360),
        14: (5, 360, 800),
        # p6: Q15, Q16
        15: (6, 60,  320),
        16: (6, 320, 800),
        # p7: Q17 + Q18 detected via text. Q19/Q20 are missing from this
        # PDF (text only shows up to Q18; cover answer line has 20 letters
        # but PDF pages stop at Q18). q19.png and q20.png on disk are
        # legacy artifacts from an unknown source — left untouched.
    },
    2019: {
        # 5 questions whose PDF markers are too unusual to detect
        # (image-only pages or marker numbers embedded in graphics).
        # PDF y values verified from text-layer scan + page render.
         7: (2,  60, 590),  # p2: figure + Pia question; ends before Q8 at y=595
        10: (3, 460, 800),  # p3: starts after Q9 options at y=456
        11: (4,  60, 330),  # p4: starts page top, ends before Q12 at y=334
        15: (5,  60, 320),  # p5: image-only page; Q15 first then Q16
        16: (5, 320, 800),  # p5: Q16 starts ~y=330 (A full glass of water)
    },
}

def find_sol_start(doc):
    for i in range(doc.page_count):
        t = doc[i].get_text()[:500]
        if '答案' in t and i > doc.page_count // 2:
            return i
        if 'Finalized' in t:
            return i
    return doc.page_count

def detect_markers(doc, total):
    sol = find_sol_start(doc)
    raw = []
    for pi in range(sol):
        page = doc[pi]
        for block in page.get_text("dict")["blocks"]:
            if "lines" not in block: continue
            for line in block["lines"]:
                spans = line["spans"]
                if not spans: continue
                txt = "".join(s["text"] for s in spans).strip()
                norm = re.sub(r'\s+', ' ', txt)
                first = spans[0]
                if first["bbox"][0] > 200:
                    continue
                for pat in PATTERNS:
                    m = pat.match(norm)
                    if m:
                        n = int(m.group(1))
                        if 1 <= n <= total:
                            raw.append({"num": n, "page": pi, "y0": first["bbox"][1]})
                        break
    by_num = {}
    for q in sorted(raw, key=lambda r:(r["page"], r["y0"])):
        if q["num"] not in by_num:
            by_num[q["num"]] = q
    return by_num  # {num: {num,page,y0}}

def render_crop(doc, page_idx, top, bot, out_path):
    page = doc[page_idx]
    pw, ph = page.rect.width, page.rect.height
    top = max(0, top)
    bot = min(ph, bot)
    clip = fitz.Rect(0, top, pw, bot)
    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE,SCALE), clip=clip)
    pix.save(str(out_path))

def fix_year(year:int, dry_run:bool=False):
    pdf = PAPERS / f"{year} 等级2：3-4年级.pdf"
    if not pdf.exists():
        pdf = PAPERS / f"{year} 等级B：3-4年级.pdf"
    if not pdf.exists():
        print(f"[{year}] PDF not found"); return
    meta = json.loads((DATA / f"{year}.json").read_text())
    total = meta["totalQuestions"]
    out_dir = IMG_ROOT / str(year)

    doc = fitz.open(pdf)
    markers = detect_markers(doc, total)

    # Build per-question crop spec (page, top, bot)
    spec = {}
    # text-layer detected: use real y0, bot = next marker on same page or page bottom
    by_page_markers = {}
    for q in markers.values():
        by_page_markers.setdefault(q["page"], []).append(q)
    for pg, lst in by_page_markers.items():
        lst.sort(key=lambda r:r["y0"])
    for pg, lst in by_page_markers.items():
        ph = doc[pg].rect.height
        for i, q in enumerate(lst):
            top = q["y0"] - 5
            bot = (lst[i+1]["y0"] - 2) if i+1 < len(lst) else (ph - 25)
            spec[q["num"]] = (pg, top, bot)

    # Hardcoded overrides for image-only pages
    for qn, (pg, top, bot) in HARDCODED_Y.get(year, {}).items():
        # Only fill in if not detected, OR if user wants to override
        if qn not in spec:
            spec[qn] = (pg, top, bot)

    # Apply: re-render every question we have a spec for
    fixed = 0; skipped = []
    for n in range(1, total+1):
        if n not in spec:
            skipped.append(n); continue
        pg, top, bot = spec[n]
        out_path = out_dir / f"q{n}.png"
        if not dry_run:
            render_crop(doc, pg, top, bot, out_path)
        fixed += 1
    print(f"[{year}] {fixed}/{total} re-cropped"
          + (f"  ⚠ skipped {skipped}" if skipped else ""))

def main():
    years = sorted(int(p.stem) for p in DATA.glob("[0-9]*.json"))
    for y in years:
        fix_year(y)

if __name__ == "__main__":
    main()
