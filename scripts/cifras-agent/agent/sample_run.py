"""Gera jobs (crop, esqueleto, contexto) para uma lista de materiais. Uso: python3 -m agent.sample_run sample.json out/round1"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys

from PIL import Image

from . import skeleton as sk_mod
from .acervo import canonical_lines, gold_path, load_praise, normalize_rhythm, resolve
from .crop import canonical_check, lyric_lines_of, overlay, segment_hymns, stitch
from .ink import measure
from .page import load_page


def build_job(item: dict, out_dir: str) -> dict:
    pdf = resolve(item["pdf"])
    pm = load_praise(pdf)
    # o número do acervo manda (o antigo pipeline errava de louvor por número de vizinho)
    target = (pm.number or str(item.get("hymn") or "")).lstrip("0") or "0"
    page = load_page(pdf, page_no=item.get("page", 0), expected_numbers=pm.catalog_numbers() or None)
    regions = segment_hymns(page)
    region = next((r for r in regions if r.number.lstrip("0") == target), None)
    res = {"job_id": item.get("job_id"), "hymn": str(target), "title": pm.name, "kind": item.get("kind"),
           "pdf": item["pdf"], "headers_found": [(h.number, h.title, h.line.col) for h in page.headers],
           "gutter": round(page.gutter, 1), "columns": page.columns}
    os.makedirs(out_dir, exist_ok=True)
    page.img.convert("RGB").resize((page.img.width // 2, page.img.height // 2)).save(os.path.join(out_dir, "page.jpg"), quality=80)
    overlay(page, regions).resize((page.img.width // 2, page.img.height // 2)).save(os.path.join(out_dir, "overlay.jpg"), quality=80)
    if region is None:
        res["status"] = "crop_failed"
        res["error"] = f"louvor {target} não encontrado; cabeçalhos: {res['headers_found']}"
        json.dump(res, open(os.path.join(out_dir, "job.json"), "w"), ensure_ascii=False, indent=1)
        return res
    ink = measure(page.img, page.scale, page.line_height())
    sk = sk_mod.build(page, region, ink)
    canon = canonical_lines(pm.lyrics)
    check = canonical_check([l.text for l in sk.lines if l.kind == "lyric"], canon)
    stitch(page, region).save(os.path.join(out_dir, "crop.png"))
    open(os.path.join(out_dir, "skeleton.txt"), "w", encoding="utf-8").write(sk_mod.render_text(sk) + "\n")
    cat0 = pm.catalog_for(str(target)) or pm.catalog_for(str(target).zfill(3))
    # tom e ritmo: a própria página manda (linha "Tonalidade: X  Ritmo: Y"); catálogo e acervo são reserva
    meta_text = " ".join(l.text for l in region.lines if l.role == "meta")
    m_key = re.search(r"tonalidade\s*:?\s*([A-G](?:#|b)?m?)\b", meta_text, re.I)
    m_rh = re.search(r"ritmo\s*:?\s*([A-Za-zÀ-ú][A-Za-zÀ-ú ]{2,24}?)(?:\s{2,}|\s*$|\s+(?:tonalidade|\d))", meta_text, re.I)
    page_key = m_key.group(1) if m_key else ""
    page_rhythm = normalize_rhythm(m_rh.group(1)) if m_rh else ""
    key = (page_key or (cat0.tonality if cat0 and cat0.tonality else pm.tonality)).strip()
    rhythm = (page_rhythm or (cat0.rhythm if cat0 and cat0.rhythm else pm.rhythm)).strip()
    res["header_sources"] = {"page_key": page_key, "page_rhythm": page_rhythm, "acervo_key": pm.tonality, "acervo_rhythm": pm.rhythm,
                             "diverge": bool((page_key and pm.tonality and page_key != pm.tonality) or (page_rhythm and pm.rhythm and page_rhythm.lower() != pm.rhythm.lower()))}
    artist_line = next((l.text.strip() for l in region.lines if l.role == "meta" and re.search(r"m[uú]s\.|le[ti]\.", l.text, re.I)), "")
    artist = re.sub(r"^[\d\s]*\(|\)\s*$", "", artist_line).strip()
    header = ["{title: " + pm.name.strip() + "}", "{subtitle: " + str(target) + "}"]
    if key:
        header.append("{key: " + key + "}")
    if rhythm:
        header.append("{rhythm: " + rhythm + "}")
    if artist:
        header.append("{artist: " + artist + "}")
    open(os.path.join(out_dir, "draft.chordpro"), "w", encoding="utf-8").write(sk_mod.weave(sk, header))
    json.dump(sk.as_dict(), open(os.path.join(out_dir, "skeleton.json"), "w"), ensure_ascii=False, indent=1)
    cat = pm.catalog_for(str(target))
    ctx = [f"# Louvor {target}: {pm.name}", "",
           f"- praise_number: {pm.number}", f"- praise_name: {pm.name}", f"- tonalidade (acervo): {pm.tonality}",
           f"- ritmo (acervo): {pm.rhythm}", f"- autor (acervo): {pm.author}", f"- edição: {item.get('kind')}"]
    if cat:
        ctx += [f"- catálogo da página: tonalidade {cat.tonality}, ritmo {cat.rhythm}, instrumentos {cat.instruments}"]
    ctx += ["", "O cabeçalho do draft.chordpro já vem preenchido com o acervo: não o altere.",
            "", "## Letra canônica do acervo (referência, não fonte)", ""] + canon
    open(os.path.join(out_dir, "context.md"), "w", encoding="utf-8").write("\n".join(ctx) + "\n")
    gp = gold_path(item.get("job_id", "")) if item.get("job_id") else None
    if gp:
        shutil.copy(gp, os.path.join(out_dir, "gold.chordpro"))
    res.update({"status": "ready", "crosses_column": region.crosses_column, "rects": [r.as_dict() for r in region.rects],
                "lyric_lines": len(sk.lines), "bars": sum(len(l.bars) for l in sk.lines),
                "chords": sum(len(l.chords) for l in sk.lines), "unknown_chords": sum(1 for l in sk.lines for c in l.chords if c.name == "?"),
                "unassigned_chords": sk.unassigned_chords, "unassigned_bars": sk.unassigned_bars,
                "canonical": {k: v for k, v in check.items() if k != "unmatched_crop_lines"}, "has_gold": bool(gp)})
    json.dump(res, open(os.path.join(out_dir, "job.json"), "w"), ensure_ascii=False, indent=1)
    return res


def main() -> None:
    items = json.load(open(sys.argv[1]))
    root = sys.argv[2]
    for it in items:
        name = it.get("stem") or it["hymn"]
        try:
            r = build_job(it, os.path.join(root, name))
        except Exception as e:  # noqa: BLE001
            r = {"status": "error", "error": repr(e), "job_id": it.get("job_id")}
            os.makedirs(os.path.join(root, name), exist_ok=True)
            json.dump(r, open(os.path.join(root, name, "job.json"), "w"), ensure_ascii=False, indent=1)
        flag = r.get("status")
        print(f"{flag:12s} {name[:48]:48s} cross={r.get('crosses_column')} lines={r.get('lyric_lines')} bars={r.get('bars')} chords={r.get('chords')} ?={r.get('unknown_chords')} canon={ (r.get('canonical') or {}).get('coverage') } foreign={len((r.get('canonical') or {}).get('foreign_lines', []))} {r.get('error','')}")


if __name__ == "__main__":
    main()
