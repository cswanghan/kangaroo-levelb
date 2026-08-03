#!/usr/bin/env python3
"""Scan all PDFs for the same 'stem-internal fake question marker' bug
that affected 2019 Q3.

Replays the same detection patterns used in process_all_levels.py.
For each year, reports questions whose detected (page, y0) is out of
order vs the previous question's. That's a strong signal the marker
was matched against a fake reference inside another question's stem.
"""
import fitz, re, json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PAPERS_DIRS = [
    BASE / "public" / "papers",                  # level B
    BASE / "public" / "level-a" / "papers",
    BASE / "public" / "level-c" / "papers",
    BASE / "public" / "level-d" / "papers",
    BASE / "public" / "level-e" / "papers",
    BASE / "public" / "level-f" / "papers",
]

PATTERNS = [
    r'^#\s*(\d{1,2})\.',
    r'^(\d{1,2})\.\s+\S',
    r'^(\d{1,2})\s*[・]\s*\S',
    r'^(\d{1,2})\s*[.．]\s*$',
]

def total_questions(year:int)->int:
    return 24 if year <= 2018 else 24  # level B always 24; level D/E/F 2019+ are 30

def find_sol_start(doc):
    for i in range(doc.page_count):
        t = doc[i].get_text()[:500]
        if '答案' in t and i > doc.page_count // 2:
            return i
        if 'Finalized' in t:
            return i
    return doc.page_count

def detect(pdf_path:Path):
    doc = fitz.open(pdf_path)
    sol = find_sol_start(doc)
    raw = []
    for pi in range(sol):
        page = doc[pi]
        for block in page.get_text("dict")["blocks"]:
            if "lines" not in block: continue
            for line in block["lines"]:
                spans = line["spans"]
                if not spans: continue
                line_text = "".join(s["text"] for s in spans).strip()
                first = spans[0]
                for pat in PATTERNS:
                    m = re.match(pat, line_text)
                    if m:
                        n = int(m.group(1))
                        if 1 <= n <= 30:
                            raw.append({
                                "n": n, "page": pi,
                                "y0": first["bbox"][1],
                                "text": line_text[:60],
                            })
                        break
    # Dedup: first occurrence by (page,y0)
    seen = set(); uniq = []
    for q in sorted(raw, key=lambda r:(r["page"], r["y0"])):
        if q["n"] in seen: continue
        seen.add(q["n"]); uniq.append(q)
    # Check monotonicity by number → (page, y0)
    by_num = sorted(uniq, key=lambda r:r["n"])
    issues = []
    prev = (-1, -1.0)
    for q in by_num:
        cur = (q["page"], q["y0"])
        if cur < prev:
            issues.append(q)
        prev = cur
    return uniq, issues, doc.page_count, sol

def main():
    print(f"{'paper':60s}  status")
    print("-"*100)
    affected = []
    for d in PAPERS_DIRS:
        if not d.exists(): continue
        for pdf in sorted(d.glob("*.pdf")):
            try:
                uniq, issues, total_p, sol = detect(pdf)
            except Exception as e:
                print(f"{pdf.name:60s}  ERROR {e}")
                continue
            found_nums = [q["n"] for q in uniq]
            tag = ""
            if issues:
                bad = ",".join(f"Q{q['n']}@p{q['page']+1}" for q in issues)
                tag = f"  ⚠ out-of-order: {bad}"
                affected.append({"pdf": str(pdf.relative_to(BASE)), "issues": issues})
            print(f"{pdf.relative_to(BASE).as_posix():60s}  detected={len(uniq)}{tag}")
    # Also flag fake-marker stems where pattern 2 triggers on number in middle of paragraph
    print()
    print("=== Summary: affected papers ===")
    for a in affected:
        print(a["pdf"])
        for q in a["issues"]:
            print(f"   Q{q['n']} page{q['page']+1} y={q['y0']:.1f}  text={q['text']!r}")
    # save
    out = BASE / "scripts" / "marker_scan_report.json"
    out.write_text(json.dumps(affected, ensure_ascii=False, indent=2))
    print(f"\n→ {out}")

if __name__ == "__main__":
    main()
