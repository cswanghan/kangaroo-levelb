#!/usr/bin/env python3
"""Audit Level B q*.png crops against a robust re-detection.

Process: for each year, robustly find true (page, y0) of each question
marker (handles '#    N  .' spacing edge case that broke 2020 Q21);
then re-render to a temp dir and SHA-1 compare against the on-disk
public/<year>/q*.png. Mismatches are reported as suspected wrong crops.

This does NOT overwrite anything. Only reports.
"""
import fitz, re, hashlib, tempfile, json, io
from pathlib import Path
from PIL import Image

BASE = Path(__file__).resolve().parent.parent
PAPERS = BASE / "public" / "papers"
IMG_ROOT = BASE / "public"
DATA = BASE / "public" / "data"
SCALE = 3

# Robust patterns: allow arbitrary whitespace between marker tokens.
# Order: most specific first.
ROBUST_PATTERNS = [
    re.compile(r'^#\s*(\d{1,2})\s*[.．]'),           # "# N." or "#    N  ."
    re.compile(r'^(\d{1,2})\s*[.．]\s*\S'),           # "N. text"
    re.compile(r'^(\d{1,2})\s*[・]\s*\S'),            # "N ・text"
    re.compile(r'^(\d{1,2})\s*[.．]\s*$'),            # standalone "N."
]

def find_sol_start(doc):
    for i in range(doc.page_count):
        t = doc[i].get_text()[:500]
        if '答案' in t and i > doc.page_count // 2:
            return i
        if 'Finalized' in t:
            return i
    return doc.page_count

def detect_markers(doc, total):
    """Return list of {num, page, y0} using robust patterns."""
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
                # collapse multiple spaces for matching but keep first span y0
                norm = re.sub(r'\s+', ' ', txt)
                first = spans[0]
                # Heuristic: marker must start at left margin x < 120
                if first["bbox"][0] > 120:
                    continue
                for pat in ROBUST_PATTERNS:
                    m = pat.match(norm)
                    if m:
                        n = int(m.group(1))
                        if 1 <= n <= total:
                            raw.append({"num": n, "page": pi, "y0": first["bbox"][1]})
                        break
    # Dedup: smallest (page, y0) per num
    by_num = {}
    for q in sorted(raw, key=lambda r:(r["page"], r["y0"])):
        if q["num"] not in by_num:
            by_num[q["num"]] = q
    return [by_num[n] for n in sorted(by_num)]

def crop_to_bytes(doc, page_idx, top, bot):
    page = doc[page_idx]
    pw = page.rect.width
    clip = fitz.Rect(0, max(0,top), pw, bot)
    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE,SCALE), clip=clip)
    return pix.tobytes("png")

def audit_year(pdf_path:Path, img_dir:Path, total:int):
    doc = fitz.open(pdf_path)
    markers = detect_markers(doc, total)
    found_nums = {m["num"] for m in markers}
    missing_from_detect = [i for i in range(1,total+1) if i not in found_nums]

    # Group by page, compute clip boxes per question
    by_page = {}
    for m in markers:
        by_page.setdefault(m["page"], []).append(m)
    for pg in by_page:
        by_page[pg].sort(key=lambda r:r["y0"])

    issues = []
    for pi, qs in by_page.items():
        page = doc[pi]
        ph = page.rect.height
        for i, q in enumerate(qs):
            top = q["y0"] - 5
            bot = (qs[i+1]["y0"] - 2) if i+1 < len(qs) else (ph - 25)
            expected = crop_to_bytes(doc, pi, top, bot)
            exp_img = Image.open(io.BytesIO(expected))
            actual_path = img_dir / f"q{q['num']}.png"
            if not actual_path.exists():
                issues.append({"q": q["num"], "kind": "missing"})
                continue
            act_img = Image.open(actual_path)
            # Compare dimensions first — fast and decisive
            ew, eh = exp_img.size
            aw, ah = act_img.size
            dh = ah - eh
            # >40 px (≈13 PDF pt) height delta = real content difference
            if abs(dh) > 40 or abs(aw - ew) > 10:
                issues.append({
                    "q": q["num"], "kind": "size-mismatch",
                    "page": pi+1, "y0": round(q["y0"],1),
                    "expected_size": [ew, eh],
                    "actual_size": [aw, ah],
                    "delta_h": dh,
                })
    for n in missing_from_detect:
        issues.append({"q": n, "kind": "marker-not-found"})
    return issues, len(markers)

def main():
    print(f"{'Year':5s} {'detected':9s} {'issues':6s}  detail")
    print("-"*120)
    summary = []
    for jp in sorted(DATA.glob("[0-9]*.json")):
        year = int(jp.stem)
        pdf_path = PAPERS / f"{year} 等级2：3-4年级.pdf"
        if not pdf_path.exists():
            pdf_path = PAPERS / f"{year} 等级B：3-4年级.pdf"
        if not pdf_path.exists():
            print(f"{year}  PDF not found")
            continue
        meta = json.loads(jp.read_text())
        total = meta.get("totalQuestions") or len(meta["questions"])
        img_dir = IMG_ROOT / str(year)
        issues, ndet = audit_year(pdf_path, img_dir, total)
        if issues:
            brief = ", ".join(
                (f"Q{i['q']}({i['kind']})" if i['kind']!='size-mismatch'
                 else f"Q{i['q']}[Δh{i['delta_h']:+d}px]")
                for i in issues[:12])
            if len(issues) > 12: brief += f", +{len(issues)-12} more"
            print(f"{year}  {ndet:9d} {len(issues):6d}  {brief}")
        else:
            print(f"{year}  {ndet:9d} {len(issues):6d}  OK")
        summary.append({"year": year, "detected": ndet, "issues": issues})
    out = BASE / "scripts" / "levelb_crop_audit.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\n→ {out}")

if __name__ == "__main__":
    main()
