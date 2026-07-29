#!/usr/bin/env python3
"""Phase 2 — stratified sample for 95% CI on ChordPro quality (no upload).

Default: n≈360 songs (±5% @ 95% CI on N≈4553), seed=42.
Strata by songs-per-PDF: 1 / 2 / 3 / 4+.

Usage:
  python3 scripts/pdf-to-chordpro/phase2_sample.py --draw
  python3 scripts/pdf-to-chordpro/phase2_sample.py --process   # batch crops + AI ab
  python3 scripts/pdf-to-chordpro/phase2_sample.py --report
"""
from __future__ import annotations

import argparse
import json
import math
import random
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
STAGING = ROOT / "storage" / "chordpro_staging"
OUT_DIR = HERE / "out"
MANIFEST = OUT_DIR / "phase2_sample.json"
REPORT = OUT_DIR / "phase2_report.json"

# Finite-population sample size for proportion, z=1.96, e=0.05, p=0.5
def sample_size(N: int, e: float = 0.05, z: float = 1.96, p: float = 0.5) -> int:
    n0 = (z**2 * p * (1 - p)) / (e**2)
    return math.ceil(n0 / (1 + (n0 - 1) / N))


def stratum_key(n_songs: int) -> str:
    if n_songs <= 1:
        return "1"
    if n_songs == 2:
        return "2"
    if n_songs == 3:
        return "3"
    return "4+"


def list_materials() -> list[dict]:
    rows = []
    for d in sorted(STAGING.iterdir()):
        if not d.is_dir():
            continue
        songs = sorted(d.glob("*.chordpro"))
        if not songs:
            continue
        src = {}
        sp = d / "_source.json"
        if sp.exists():
            src = json.loads(sp.read_text(encoding="utf-8"))
        rows.append(
            {
                "material_id": d.name,
                "prefix": d.name[:8],
                "n_songs": len(songs),
                "stratum": stratum_key(len(songs)),
                "praise_name": src.get("praise_name"),
                "songs": [p.name for p in songs],
                "has_crops": (d / "_ocr_debug" / "_crops").is_dir(),
            }
        )
    return rows


def draw_sample(rows: list[dict], *, n_target: int, seed: int) -> dict:
    """Proportional stratified sample of songs; returns materials + selected songs."""
    # Expand to song units
    song_units: list[dict] = []
    for r in rows:
        for i, name in enumerate(r["songs"]):
            song_units.append(
                {
                    "material_id": r["material_id"],
                    "prefix": r["prefix"],
                    "song": name,
                    "stratum": r["stratum"],
                    "praise_name": r["praise_name"],
                    "idx": i,
                }
            )
    N = len(song_units)
    n = min(n_target, N)
    by_s: dict[str, list[dict]] = defaultdict(list)
    for u in song_units:
        by_s[u["stratum"]].append(u)

    rng = random.Random(seed)
    picked: list[dict] = []
    # proportional allocation, at least 1 per non-empty stratum
    for s, bucket in sorted(by_s.items()):
        share = max(1, round(n * len(bucket) / N))
        share = min(share, len(bucket))
        rng.shuffle(bucket)
        picked.extend(bucket[:share])

    # adjust to exact n
    rng.shuffle(picked)
    if len(picked) > n:
        picked = picked[:n]
    elif len(picked) < n:
        chosen = {(u["material_id"], u["song"]) for u in picked}
        rest = [u for u in song_units if (u["material_id"], u["song"]) not in chosen]
        rng.shuffle(rest)
        picked.extend(rest[: n - len(picked)])

    materials = sorted({u["material_id"] for u in picked})
    strata_counts = defaultdict(int)
    for u in picked:
        strata_counts[u["stratum"]] += 1

    return {
        "seed": seed,
        "N_songs": N,
        "N_materials": len(rows),
        "n_songs": len(picked),
        "n_materials": len(materials),
        "margin": 0.05,
        "confidence": 0.95,
        "formula_n": sample_size(N),
        "strata": dict(strata_counts),
        "materials": materials,
        "songs": picked,
    }


def wilson_ci(successes: int, n: int, z: float = 1.96) -> tuple[float, float, float]:
    if n <= 0:
        return 0.0, 0.0, 0.0
    p = successes / n
    den = 1 + z**2 / n
    centre = (p + z**2 / (2 * n)) / den
    half = (z / den) * math.sqrt(p * (1 - p) / n + z**2 / (4 * n**2))
    return p, max(0.0, centre - half), min(1.0, centre + half)


def cmd_draw(args: argparse.Namespace) -> None:
    rows = list_materials()
    N = sum(r["n_songs"] for r in rows)
    n_target = args.n or sample_size(N)
    sample = draw_sample(rows, n_target=n_target, seed=args.seed)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Wrote {MANIFEST.relative_to(ROOT)}  "
        f"songs={sample['n_songs']}/{sample['N_songs']}  "
        f"materials={sample['n_materials']}  strata={sample['strata']}"
    )


def load_manifest() -> dict:
    if not MANIFEST.exists():
        raise SystemExit(f"Missing {MANIFEST}; run --draw first")
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def cmd_process(args: argparse.Namespace) -> None:
    sample = load_manifest()
    ids = sorted(sample["materials"])
    chunk = args.chunk
    done_marker = OUT_DIR / "phase2_batch_done.txt"
    done: set[str] = set()
    if done_marker.exists() and not args.restart:
        done = {ln.strip() for ln in done_marker.read_text().splitlines() if ln.strip()}
        print(f"resume: {len(done)} materials already batched")

    pending = [m for m in ids if m not in done]
    for i in range(0, len(pending), chunk):
        part = pending[i : i + chunk]
        print(f"\n## batch crops {i + 1}-{i + len(part)}/{len(pending)} (of {len(ids)} total)")
        sys.stdout.flush()
        cmd = [
            sys.executable,
            "-u",
            str(HERE / "batch.py"),
            "--ids",
            *part,
            "--debug",
            "--crops",
        ]
        if args.dry_run:
            print(" ", "batch", len(part), "materials")
        else:
            rc = subprocess.run(cmd, cwd=str(ROOT), check=False).returncode
            if rc == 0:
                with done_marker.open("a", encoding="utf-8") as f:
                    for mid in part:
                        f.write(mid + "\n")
            else:
                print(f"batch chunk rc={rc}; continuing")
        sys.stdout.flush()

    prefixes = sorted({m[:8] for m in ids})
    print(f"\n## AI fallback modes=ab on {len(prefixes)} materials")
    sys.stdout.flush()
    cmd = [
        sys.executable,
        "-u",
        str(HERE / "ai_fallback.py"),
        "--ids",
        *prefixes,
        "--modes",
        "ab",
    ]
    if args.force:
        cmd.append("--force")
    if args.dry_run:
        print(" ", "ai_fallback", len(prefixes), "prefixes")
    else:
        subprocess.run(cmd, cwd=str(ROOT), check=False)
    print("## process finished")
    sys.stdout.flush()


def resolve_sample_song(material_id: str, song: str, idx: int = 0) -> Path | None:
    """Map sample filename → current staging file (batch may rename slugs)."""
    import re

    d = STAGING / material_id
    if not d.is_dir():
        return None
    direct = d / song
    if direct.exists():
        return direct
    m = re.match(r"^(\d+)-(\d+)-", song)
    if m:
        seq, num = m.group(1), m.group(2)
        hits = sorted(d.glob(f"{seq}-{num}-*.chordpro"))
        if len(hits) == 1:
            return hits[0]
        hits = sorted(d.glob(f"*-{num}-*.chordpro"))
        if len(hits) == 1:
            return hits[0]
    songs = sorted(d.glob("*.chordpro"))
    if 0 <= idx < len(songs):
        return songs[idx]
    return None


def cmd_report(args: argparse.Namespace) -> None:
    sys.path.insert(0, str(HERE))
    from sample_qa import score_file

    sample = load_manifest()
    rows = []
    for u in sample["songs"]:
        mid = u["material_id"]
        song = u["song"]
        idx = int(u.get("idx") or 0)
        path = resolve_sample_song(mid, song, idx)
        if path is None:
            rows.append(
                {
                    "material_id": mid,
                    "song": song,
                    "resolved": None,
                    "ok": False,
                    "flags": ["missing"],
                    "auto_ok": False,
                }
            )
            continue
        sc = score_file(path)
        rows.append(
            {
                "material_id": mid,
                "song": song,
                "resolved": path.name,
                "ok": sc["ok"],
                "flags": sc["flags"],
                "density": sc["density"],
                "bad_pct": sc["bad_pct"],
                "body_lines": sc["body_lines"],
                "auto_ok": sc["ok"],
            }
        )

    ok_n = sum(1 for r in rows if r["auto_ok"])
    n = len(rows)
    p, lo, hi = wilson_ci(ok_n, n)
    fails = [r for r in rows if not r["auto_ok"]]

    rng = random.Random(sample["seed"])
    passes = [r for r in rows if r["auto_ok"]]
    rng.shuffle(passes)
    rng.shuffle(fails)
    # human pack: mix fails + passes, capped
    n_fail_h = min(len(fails), max(15, args.human_n // 2))
    n_pass_h = min(len(passes), args.human_n - n_fail_h)
    human = fails[:n_fail_h] + passes[:n_pass_h]
    rng.shuffle(human)

    report = {
        "n": n,
        "auto_ok": ok_n,
        "auto_fail": n - ok_n,
        "auto_ok_rate": round(100 * p, 2),
        "wilson_95_ci": [round(100 * lo, 2), round(100 * hi, 2)],
        "interpretation": (
            f"Com 95% de confiança, a taxa automática de ok na base está entre "
            f"{100 * lo:.1f}% e {100 * hi:.1f}% (amostra n={n})."
        ),
        "fail_flag_counts": {},
        "fails": fails,
        "human_review": [
            {
                "material_id": r["material_id"][:8],
                "song": r.get("resolved") or r["song"],
                "auto_ok": r["auto_ok"],
                "flags": r["flags"],
                "path": f"storage/chordpro_staging/{r['material_id']}/{r.get('resolved') or r['song']}",
                "human_ok": None,
            }
            for r in human
        ],
    }
    from collections import Counter

    fc: Counter[str] = Counter()
    for r in fails:
        for f in r["flags"] or ["unknown"]:
            fc[f] += 1
    report["fail_flag_counts"] = dict(fc.most_common())

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"SUMMARY  auto_ok={ok_n}/{n}  ({100 * p:.1f}%)")
    print(f"Wilson 95% CI: [{100 * lo:.1f}%, {100 * hi:.1f}%]")
    print(report["interpretation"])
    print(f"Fail flags: {report['fail_flag_counts']}")
    if fails:
        print(f"\nFails ({len(fails)}), showing up to 25:")
        for r in fails[:25]:
            print(
                f"  {r['material_id'][:8]}  {r.get('resolved') or r['song']}  {r['flags']}"
            )
    print(f"\nHuman review pack: {len(human)} songs → {REPORT.relative_to(ROOT)}")
    write_review_html(report["human_review"])


def write_review_html(items: list[dict]) -> Path:
    """Self-contained local HTML to mark the 50 (no frontend/D1)."""
    cards: list[dict] = []
    for i, it in enumerate(items):
        rel = it["path"]
        abs_path = ROOT / rel
        content = ""
        if abs_path.exists():
            content = abs_path.read_text(encoding="utf-8", errors="replace")
        cards.append(
            {
                "i": i,
                "path": rel,
                "song": it.get("song"),
                "auto_ok": it.get("auto_ok"),
                "flags": it.get("flags") or [],
                "content": content,
            }
        )

    html_path = OUT_DIR / "phase2_review.html"
    payload = json.dumps(cards, ensure_ascii=False)
    html_path.write_text(
        f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Coldigom — revisão humana fase 2 (50)</title>
<style>
  :root {{ font-family: ui-sans-serif, system-ui, sans-serif; color: #1a1a1a; }}
  body {{ margin: 0; background: #f4f4f0; }}
  header {{ position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd;
            padding: 12px 20px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; z-index: 2; }}
  header strong {{ font-size: 1.05rem; }}
  .stats {{ color: #555; }}
  button, label.choice {{ cursor: pointer; }}
  button {{ border: 1px solid #bbb; background: #fff; padding: 8px 12px; border-radius: 6px; }}
  button.primary {{ background: #1b5e3b; color: #fff; border-color: #1b5e3b; }}
  main {{ max-width: 920px; margin: 0 auto; padding: 16px 20px 80px; }}
  .card {{ background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 16px; margin: 14px 0; }}
  .card.done-ok {{ border-color: #7cb892; }}
  .card.done-bad {{ border-color: #d08888; }}
  .meta {{ display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; font-size: .92rem; }}
  .badge {{ padding: 2px 8px; border-radius: 999px; background: #eee; }}
  .badge.fail {{ background: #fde8e8; }}
  .badge.pass {{ background: #e7f6ec; }}
  pre {{ white-space: pre-wrap; background: #fafaf7; border: 1px solid #eee; padding: 12px;
         border-radius: 8px; max-height: 280px; overflow: auto; font-size: .85rem; }}
  .choices {{ display: flex; gap: 12px; margin-top: 10px; }}
  .choice {{ border: 1px solid #ccc; border-radius: 8px; padding: 8px 12px; background: #fafafa; }}
  .choice input {{ margin-right: 6px; }}
  .choice.selected-ok {{ background: #e7f6ec; border-color: #7cb892; }}
  .choice.selected-bad {{ background: #fde8e8; border-color: #d08888; }}
  .path {{ color: #777; font-size: .8rem; word-break: break-all; }}
</style>
</head>
<body>
<header>
  <strong>Revisão humana — fase 2</strong>
  <span class="stats" id="stats">0/50</span>
  <button type="button" id="btnSave">Salvar vereditos (JSON)</button>
  <button type="button" class="primary" id="btnExport">Baixar phase2_verdicts.json</button>
</header>
<main id="list"></main>
<script>
const CARDS = {payload};
const KEY = 'coldigom_phase2_verdicts_v1';
function load() {{
  try {{ return JSON.parse(localStorage.getItem(KEY) || '{{}}'); }} catch {{ return {{}}; }}
}}
function save(v) {{ localStorage.setItem(KEY, JSON.stringify(v)); renderStats(); }}
function renderStats() {{
  const v = load();
  const n = CARDS.length;
  const done = CARDS.filter(c => v[c.path] === true || v[c.path] === false).length;
  const ok = CARDS.filter(c => v[c.path] === true).length;
  const bad = CARDS.filter(c => v[c.path] === false).length;
  document.getElementById('stats').textContent =
    `${{done}}/${{n}} marcados · ok=${{ok}} · precisa ajuste=${{bad}}`;
}}
function setVerdict(path, val) {{
  const v = load();
  v[path] = val;
  save(v);
  const card = document.querySelector(`[data-path="${{CSS.escape(path)}}"]`);
  if (card) {{
    card.classList.toggle('done-ok', val === true);
    card.classList.toggle('done-bad', val === false);
    card.querySelectorAll('.choice').forEach(el => el.classList.remove('selected-ok','selected-bad'));
    const sel = card.querySelector(val ? '.choice-ok' : '.choice-bad');
    if (sel) sel.classList.add(val ? 'selected-ok' : 'selected-bad');
  }}
}}
function render() {{
  const v = load();
  const root = document.getElementById('list');
  root.innerHTML = CARDS.map(c => {{
    const marked = v[c.path];
    const cls = marked === true ? 'done-ok' : marked === false ? 'done-bad' : '';
    const flags = (c.flags || []).join(', ') || '—';
    return `<article class="card ${{cls}}" data-path="${{c.path}}">
      <div class="meta">
        <span class="badge">#${{c.i + 1}}</span>
        <span class="badge ${{c.auto_ok ? 'pass' : 'fail'}}">auto: ${{c.auto_ok ? 'ok' : 'fail'}}</span>
        <span class="badge">flags: ${{flags}}</span>
        <strong>${{c.song || ''}}</strong>
      </div>
      <div class="path">${{c.path}}</div>
      <pre>${{escapeHtml(c.content || '(arquivo ausente)')}}</pre>
      <div class="choices">
        <label class="choice choice-ok ${{marked === true ? 'selected-ok' : ''}}">
          <input type="radio" name="v${{c.i}}" ${{marked === true ? 'checked' : ''}}
            onchange="setVerdict('${{c.path.replace(/'/g, "\\\\'")}}', true)"/> OK (raro/nenhum ajuste)
        </label>
        <label class="choice choice-bad ${{marked === false ? 'selected-bad' : ''}}">
          <input type="radio" name="v${{c.i}}" ${{marked === false ? 'checked' : ''}}
            onchange="setVerdict('${{c.path.replace(/'/g, "\\\\'")}}', false)"/> Precisa ajuste
        </label>
      </div>
    </article>`;
  }}).join('');
  renderStats();
}}
function escapeHtml(s) {{
  return s.replace(/[&<>"']/g, ch => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}})[ch]);
}}
function exportVerdicts() {{
  const v = load();
  const rows = CARDS.map(c => ({{
    path: c.path,
    song: c.song,
    auto_ok: c.auto_ok,
    flags: c.flags,
    human_ok: v[c.path] === undefined ? null : v[c.path],
  }}));
  const done = rows.filter(r => r.human_ok !== null);
  const ok = done.filter(r => r.human_ok === true).length;
  const summary = {{
    n_marked: done.length,
    n_total: rows.length,
    human_ok_rate: done.length ? +(100 * ok / done.length).toFixed(1) : null,
    needs_adjust_rate: done.length ? +(100 * (done.length - ok) / done.length).toFixed(1) : null,
    items: rows,
  }};
  const blob = new Blob([JSON.stringify(summary, null, 2)], {{type: 'application/json'}});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'phase2_verdicts.json';
  a.click();
}}
document.getElementById('btnSave').onclick = () => {{ renderStats(); alert('Vereditos salvos neste navegador (localStorage).'); }};
document.getElementById('btnExport').onclick = exportVerdicts;
render();
</script>
</body>
</html>
""",
        encoding="utf-8",
    )
    print(f"Review UI: {html_path.relative_to(ROOT)}")
    print(f"  open: open '{html_path}'")
    return html_path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--draw", action="store_true", help="draw stratified sample")
    ap.add_argument("--process", action="store_true", help="batch --crops + ai_fallback ab")
    ap.add_argument("--report", action="store_true", help="QA + Wilson CI on sample")
    ap.add_argument(
        "--review-ui",
        action="store_true",
        help="generate local HTML to review the 50 (from phase2_report.json)",
    )
    ap.add_argument("--n", type=int, default=0, help="override sample size (default formula)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--chunk", type=int, default=20, help="batch --ids chunk size")
    ap.add_argument("--force", action="store_true", help="pass --force to AI")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--restart", action="store_true", help="ignore batch resume marker")
    ap.add_argument("--human-n", type=int, default=50, help="songs in human review pack")
    args = ap.parse_args()
    if not (args.draw or args.process or args.report or args.review_ui):
        ap.error("Pass --draw and/or --process and/or --report and/or --review-ui")
    if args.draw:
        cmd_draw(args)
    if args.process:
        cmd_process(args)
    if args.report:
        cmd_report(args)
    if args.review_ui:
        if not REPORT.exists():
            raise SystemExit("Missing phase2_report.json — run --report first")
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        write_review_html(report.get("human_review") or [])



if __name__ == "__main__":
    main()
