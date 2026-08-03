#!/usr/bin/env python3
"""Validate Level B question data: answer field vs final claim in explanation.

Detects cases where the explanation/solution_steps conclusively claim a different
option letter than the `answer` field.

Usage:
  python3 scripts/validate_answers.py
  python3 scripts/validate_answers.py --json

Exit code 0 if clean, 1 if mismatches found.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"

# Letter not followed by another ASCII letter (avoid matching "Claire" as C)
L = r"([A-E])(?![A-Za-z])"

# Patterns that express a FINAL answer claim (not mere discussion of options)
FINAL_CLAIM_PATTERNS = [
    rf"对应的是选项\s*{L}",
    rf"只有选项\s*{L}",
    rf"是选项\s*{L}",
    rf"到达的位置是选项\s*{L}",
    rf"正确答案[是为：:\s]*{L}",
    rf"所以答案[是为：:\s]*{L}",
    rf"(?:所以|因此)\s*{L}\s*是正确答案",
    rf"{L}\s*是正确答案",
    # "答案是 B" but not "答案是 Claire"
    rf"答案[是为：:]\s*{L}(?![\u4e00-\u9fffA-Za-z])",
    rf"应选\s*{L}",
    rf"选项\s*{L}\s*(?:展开后|的颜色排列|的风车|完全吻合|完全对应|完全匹配|对应的房子|的正确状态|正好等于|展示的形状符合)",
    rf"，选{L}\s*$",
    rf"选{L}\s*$",
    rf"小爱的手机是{L}选项",
    rf"{L}选项(?:正好|是原|展示|的手机|的房子)",
]


def extract_final_claims(text: str) -> list[tuple[int, str]]:
    """Return list of (position, letter) for all final-claim matches."""
    found: list[tuple[int, str]] = []
    for pat in FINAL_CLAIM_PATTERNS:
        for m in re.finditer(pat, text or "", flags=re.MULTILINE):
            found.append((m.start(), m.group(1).upper()))
    found.sort(key=lambda x: x[0])
    return found


def validate_file(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    year = data.get("year", path.stem)
    issues: list[dict] = []

    for q in data.get("questions") or []:
        ans = str(q.get("answer") or "").strip().upper()
        qn = q.get("number")

        if ans not in "ABCDE":
            issues.append(
                {
                    "year": year,
                    "question": qn,
                    "kind": "invalid_answer",
                    "answer": ans,
                    "message": f"answer must be A–E, got {ans!r}",
                }
            )
            continue

        full = "\n".join(
            [
                q.get("explanation") or "",
                "\n".join(q.get("solution_steps") or []),
                q.get("difficulty_note") or "",
            ]
        )
        claims = extract_final_claims(full)
        if claims:
            # Use the last conclusive claim as the "final answer" stated in text
            last_letter = claims[-1][1]
            all_letters = sorted({c for _, c in claims})
            if last_letter != ans:
                issues.append(
                    {
                        "year": year,
                        "question": qn,
                        "kind": "answer_text_mismatch",
                        "answer": ans,
                        "final_claim": last_letter,
                        "all_claims": all_letters,
                        "explanation_preview": (q.get("explanation") or "")[:160],
                    }
                )

        if not q.get("image"):
            issues.append(
                {
                    "year": year,
                    "question": qn,
                    "kind": "missing_image",
                    "answer": ans,
                }
            )

        # Image file existence for Level B layout public/{year}/{image}
        img = q.get("image")
        if img:
            img_path = ROOT / "public" / str(year) / img
            if not img_path.exists():
                issues.append(
                    {
                        "year": year,
                        "question": qn,
                        "kind": "missing_image_file",
                        "answer": ans,
                        "path": str(img_path.relative_to(ROOT)),
                    }
                )

    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", dest="as_json", action="store_true")
    parser.add_argument("--dir", type=Path, default=DATA_DIR)
    args = parser.parse_args()

    paths = sorted(p for p in args.dir.glob("*.json") if p.name != "index.json")
    if not paths:
        print(f"No data files in {args.dir}", file=sys.stderr)
        return 1

    all_issues: list[dict] = []
    for path in paths:
        all_issues.extend(validate_file(path))

    mismatches = [i for i in all_issues if i["kind"] == "answer_text_mismatch"]
    others = [i for i in all_issues if i["kind"] != "answer_text_mismatch"]

    if args.as_json:
        print(
            json.dumps(
                {"ok": not mismatches, "mismatches": mismatches, "other": others},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"Scanned {len(paths)} files under {args.dir}")
        if mismatches:
            print(f"\n❌ {len(mismatches)} answer/explanation mismatch(es):")
            for i in mismatches:
                print(
                    f"  - {i['year']} Q{i['question']}: answer={i['answer']} "
                    f"final_claim={i['final_claim']} all={i['all_claims']}"
                )
                print(f"    {i.get('explanation_preview', '')}")
        else:
            print("✅ No answer/explanation mismatches")

        if others:
            print(f"\n⚠️  {len(others)} other issue(s) (non-blocking for exit code):")
            for i in others[:30]:
                print(f"  - {i['kind']}: {i.get('year')} Q{i.get('question')} {i}")

    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main())
