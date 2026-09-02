"""Página de validação de uma rodada: PDF, crop, extração, checks, gabarito. Uso: python3 -m agent.review_page out/round1 [titulo]"""
from __future__ import annotations

import base64
import io
import json
import os
import sys

from PIL import Image


def _b64_jpeg(path: str, max_w: int, q: int = 82) -> str:
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=q, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _read(path: str) -> str:
    return open(path, encoding="utf-8").read() if os.path.exists(path) else ""


def collect(root: str) -> list[dict]:
    items = []
    for name in sorted(os.listdir(root)):
        d = os.path.join(root, name)
        if not os.path.exists(os.path.join(d, "job.json")):
            continue
        job = json.load(open(os.path.join(d, "job.json")))
        it = {
            "id": name, "hymn": job.get("hymn"), "title": job.get("title"), "kind": job.get("kind"),
            "status": job.get("status"), "crosses": job.get("crosses_column"), "rects": job.get("rects", []),
            "gutter": job.get("gutter"), "headers": job.get("headers_found", []), "pdf": job.get("pdf"),
            "canonical": job.get("canonical"), "lines": job.get("lyric_lines"), "bars": job.get("bars"),
            "chords": job.get("chords"), "unknown": job.get("unknown_chords"),
            "page": _b64_jpeg(os.path.join(d, "overlay.jpg"), 720) if os.path.exists(os.path.join(d, "overlay.jpg")) else "",
            "crop": _b64_jpeg(os.path.join(d, "crop.png"), 900, 85) if os.path.exists(os.path.join(d, "crop.png")) else "",
            "candidate": _read(os.path.join(d, "candidate.chordpro")),
            "skeleton": _read(os.path.join(d, "skeleton.txt")),
            "gold": _read(os.path.join(d, "gold.chordpro")),
            "notes": _read(os.path.join(d, "reader_notes.json")),
            "verify": json.load(open(os.path.join(d, "verify.json"))) if os.path.exists(os.path.join(d, "verify.json")) else None,
        }
        bench = os.path.join(root, "bench.json")
        if os.path.exists(bench):
            for r in json.load(open(bench)):
                if r.get("job") == name and r.get("gold"):
                    it["gold_metrics"] = r["gold"]
        items.append(it)
    return items


TEMPLATE = r"""<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--paper:#FBFAF6;--panel:#FFFFFF;--ink:#1D1B17;--muted:#6E6A60;--line:#E2DFD6;--red:#C41E3A;--red-soft:#F7E3E6;--ok:#2E7D4F;--ok-soft:#E1F0E6;--bad:#B3261E;--bad-soft:#F9E1DE;--warn:#8A5A00;--warn-soft:#F6ECD2;--sel:#EFEBE0;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#161615;--panel:#1E1E1C;--ink:#ECE9E1;--muted:#A19C90;--line:#33322E;--red:#FF6B7A;--red-soft:#3B1F24;--ok:#7BCB98;--ok-soft:#1E3327;--bad:#F08A80;--bad-soft:#3E211E;--warn:#E8B75A;--warn-soft:#3A2E14;--sel:#2A2925;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#161615;--panel:#1E1E1C;--ink:#ECE9E1;--muted:#A19C90;--line:#33322E;--red:#FF6B7A;--red-soft:#3B1F24;--ok:#7BCB98;--ok-soft:#1E3327;--bad:#F08A80;--bad-soft:#3E211E;--warn:#E8B75A;--warn-soft:#3A2E14;--sel:#2A2925;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 "IBM Plex Sans",system-ui,sans-serif}
h1{font:700 30px/1.1 Fraunces,Georgia,serif;margin:0;text-wrap:balance}
h2{font:700 20px/1.2 Fraunces,Georgia,serif;margin:0;text-wrap:balance}
h3{font:600 12px/1.2 "IBM Plex Sans",sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 8px}
.top{padding:22px 28px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
.top p{margin:6px 0 0;color:var(--muted);max-width:62ch}
.stats{display:flex;gap:18px;font-variant-numeric:tabular-nums}
.stats div{display:flex;flex-direction:column;align-items:flex-end}
.stats b{font:700 22px/1 Fraunces,serif}
.stats span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.app{display:grid;grid-template-columns:280px 1fr;min-height:calc(100vh - 90px)}
nav{border-right:1px solid var(--line);padding:12px 0;position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto}
nav button{display:grid;grid-template-columns:44px 1fr auto;gap:8px;align-items:center;width:100%;text-align:left;padding:9px 14px;border:0;background:none;color:var(--ink);font:inherit;cursor:pointer;border-left:3px solid transparent}
nav button:hover{background:var(--sel)}nav button.on{background:var(--sel);border-left-color:var(--red)}
nav button:focus-visible{outline:2px solid var(--red);outline-offset:-2px}
nav .n{font:700 16px/1 Fraunces,serif;font-variant-numeric:tabular-nums}
nav .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
nav .t small{display:block;color:var(--muted);font-size:11px}
.pill{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:999px;white-space:nowrap}
.pill.ok{background:var(--ok-soft);color:var(--ok)}.pill.bad{background:var(--bad-soft);color:var(--bad)}.pill.warn{background:var(--warn-soft);color:var(--warn)}.pill.mut{background:var(--sel);color:var(--muted)}
main{padding:18px 24px 60px;min-width:0}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.meta{color:var(--muted);font-size:12px;margin-top:4px}
.meta code{font:12px "IBM Plex Mono",monospace}
.cols{display:grid;grid-template-columns:minmax(260px,1fr) minmax(300px,1.15fr) minmax(360px,1.4fr);gap:16px;align-items:start}
.box{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:12px;min-width:0}
.box img{width:100%;display:block;border:1px solid var(--line)}
.scroll{max-height:78vh;overflow:auto}
.cifra{font:13.5px/1.35 "IBM Plex Sans",sans-serif;white-space:pre;overflow-x:auto}
.cifra .ln{display:flex;flex-wrap:nowrap;min-height:2.6em;align-items:flex-end}
.cifra .ln.blank{min-height:1em}
.cifra .seg{display:inline-flex;flex-direction:column;align-items:flex-start}
.cifra .ch{color:var(--red);font-weight:600;font-size:12.5px;line-height:1.1;min-height:1.2em;padding-right:.35em}
.cifra .ly{white-space:pre}
.cifra .bar{display:inline-block;width:1.5px;height:1.05em;background:var(--red);vertical-align:-2px;margin-right:1px}
.cifra .dir{color:var(--muted);font:12px "IBM Plex Mono",monospace}
.cifra .cm{font-weight:600;margin-top:8px}
.cifra .rep{color:var(--red);font-style:italic;font-weight:600}
.tabs{display:flex;gap:4px;margin-bottom:8px}
.tabs button{border:1px solid var(--line);background:none;color:var(--muted);font:inherit;font-size:12px;padding:4px 10px;border-radius:4px;cursor:pointer}
.tabs button.on{background:var(--sel);color:var(--ink);border-color:var(--muted)}
.tabs button:focus-visible{outline:2px solid var(--red)}
pre.raw{font:12px/1.45 "IBM Plex Mono",monospace;white-space:pre;overflow-x:auto;margin:0}
.checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:14px}
.chk{border:1px solid var(--line);border-left:4px solid var(--ok);border-radius:4px;padding:8px 10px;background:var(--panel)}
.chk.bad{border-left-color:var(--bad)}.chk b{display:block;font-size:12px}.chk span{color:var(--muted);font-size:12px}
.metrics{display:flex;gap:14px;flex-wrap:wrap;font-variant-numeric:tabular-nums;margin-top:8px}
.metrics div b{font:700 18px/1 Fraunces,serif;display:block}.metrics div span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.verdict{margin-top:16px;border-top:1px solid var(--line);padding-top:12px;display:grid;grid-template-columns:auto auto 1fr;gap:12px;align-items:start}
.verdict fieldset{border:0;padding:0;margin:0;display:flex;gap:4px;align-items:center}
.verdict legend{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:0;margin-bottom:4px}
.verdict label{border:1px solid var(--line);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px}
.verdict input{position:absolute;opacity:0;width:0;height:0}
.verdict label.ok:has(input:checked){background:var(--ok-soft);border-color:var(--ok);color:var(--ok)}
.verdict label.bad:has(input:checked){background:var(--bad-soft);border-color:var(--bad);color:var(--bad)}
.verdict label:has(input:focus-visible){outline:2px solid var(--red)}
.verdict textarea{width:100%;min-height:52px;font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--panel);color:var(--ink);resize:vertical}
.summary{margin:24px 24px 40px;padding:14px;border:1px dashed var(--line);border-radius:6px}
.summary textarea{width:100%;min-height:120px;font:12px/1.4 "IBM Plex Mono",monospace;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:8px}
.diff{font:12px/1.45 "IBM Plex Mono",monospace;white-space:pre;overflow-x:auto}
.diff .del{background:var(--bad-soft);color:var(--bad)}.diff .add{background:var(--ok-soft);color:var(--ok)}
@media (max-width:1100px){.app{grid-template-columns:1fr}nav{position:static;max-height:none;display:flex;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--line)}nav button{width:auto}.cols{grid-template-columns:1fr}}
@media (prefers-reduced-motion:no-preference){nav button,.tabs button{transition:background .12s}}
</style>
<div class="top">
  <div><h1>__TITLE__</h1><p>Cada louvor traz a página original com o recorte marcado, o crop que o leitor viu e a cifra extraída, renderizada como no hinário: acorde vermelho acima da sílaba, barra vermelha onde o acorde está colado. Marque o veredito e copie o resumo no fim da página.</p></div>
  <div class="stats"><div><b id="s-n">0</b><span>louvores</span></div><div><b id="s-cross">0</b><span>atravessam coluna</span></div><div><b id="s-ok">0</b><span>passam nos checks</span></div><div><b id="s-gold">0</b><span>com gabarito</span></div></div>
</div>
<div class="app"><nav id="nav"></nav><main id="main"></main></div>
<div class="summary"><h3>Resumo dos vereditos (copie e cole no chat)</h3><textarea id="sum" readonly></textarea></div>
<script>
const DATA = __DATA__;
const KEY = 'cifras-round-verdicts:' + __ROUND__;
let verdicts = {}; try { verdicts = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { verdicts = {}; }
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function renderCifra(text){
  if(!text) return '<div class="meta">sem extração</div>';
  const out=[];
  for(const raw of text.split('\n')){
    const line=raw.replace(/\s+$/,'');
    if(!line.trim()){out.push('<div class="ln blank"></div>');continue;}
    let m;
    if((m=line.match(/^\{comment:\s*(.*)\}$/i))){out.push('<div class="ln cm">'+esc(m[1])+'</div>');continue;}
    if(/^\{.*\}$/.test(line)){out.push('<div class="ln"><span class="dir">'+esc(line)+'</span></div>');continue;}
    if(/^\s*\[\*[^\]]*\]\s*$/.test(line)){out.push('<div class="ln"><span class="rep">'+esc(line.replace(/[\[\]\*]/g,''))+' ×</span></div>');continue;}
    const parts=[];let pos=0;const re=/\[([^\]]*)\]/g;let mm;
    while((mm=re.exec(line))){if(mm.index>pos)parts.push({t:'l',v:line.slice(pos,mm.index)});parts.push({t:'c',v:mm[1]});pos=re.lastIndex;}
    if(pos<line.length)parts.push({t:'l',v:line.slice(pos)});
    // segmentos: acorde + texto seguinte
    const segs=[];let cur={ch:'',ly:''};
    for(const p of parts){ if(p.t==='c'){ if(cur.ch||cur.ly){segs.push(cur);} cur={ch:p.v,ly:''}; } else { cur.ly+=p.v; } }
    if(cur.ch||cur.ly)segs.push(cur);
    let html='';
    for(let i=0;i<segs.length;i++){
      const s=segs[i];const prev=segs[i-1];
      const touchRight=s.ch&&s.ly&&!/^\s/.test(s.ly);
      const touchLeft=s.ch&&prev&&prev.ly&&!/\s$/.test(prev.ly);
      const glued=touchRight||touchLeft;
      html+='<span class="seg"><span class="ch">'+esc(s.ch)+'</span><span class="ly">'+(glued&&s.ch?'<i class="bar"></i>':'')+esc(s.ly)+'</span></span>';
    }
    out.push('<div class="ln">'+html+'</div>');
  }
  return out.join('');
}
function diffLines(a,b){ // LCS simples por linha: a = gabarito, b = candidato
  const A=a.split('\n'),B=b.split('\n');const n=A.length,m=B.length;const L=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i][j]=A[i]===B[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const out=[];let i=0,j=0;
  while(i<n&&j<m){ if(A[i]===B[j]){out.push('  '+esc(A[i]));i++;j++;} else if(L[i+1][j]>=L[i][j+1]){out.push('<span class="del">- '+esc(A[i])+'</span>');i++;} else {out.push('<span class="add">+ '+esc(B[j])+'</span>');j++;} }
  while(i<n)out.push('<span class="del">- '+esc(A[i++])+'</span>');while(j<m)out.push('<span class="add">+ '+esc(B[j++])+'</span>');
  return out.join('\n');
}
function pillFor(it){ if(!it.verify) return '<span class="pill mut">sem leitura</span>'; return it.verify.ok?'<span class="pill ok">checks ok</span>':'<span class="pill bad">'+it.verify.checks.filter(c=>!c.ok).map(c=>c.id).join(' ')+'</span>'; }
function renderNav(sel){
  document.getElementById('nav').innerHTML=DATA.map((it,i)=>'<button class="'+(i===sel?'on':'')+'" data-i="'+i+'"><span class="n">'+esc(it.hymn)+'</span><span class="t">'+esc(it.title)+'<small>'+esc(it.kind||'')+(it.crosses?' · atravessa coluna':'')+(it.gold?' · gabarito':'')+'</small></span>'+pillFor(it)+'</button>').join('');
}
function renderItem(i){
  const it=DATA[i];const v=verdicts[it.id]||{};
  const checks=it.verify?it.verify.checks.map(c=>'<div class="chk '+(c.ok?'':'bad')+'"><b>'+esc(c.id)+' · '+esc(c.name)+'</b><span>'+esc(c.detail)+'</span></div>').join(''):'<div class="meta">O leitor ainda não produziu candidato.</div>';
  const gm=it.gold_metrics?'<div class="metrics"><div><b>'+gm_(it.gold_metrics.chord_f1)+'</b><span>acordes f1</span></div><div><b>'+gm_(it.gold_metrics.chord_seq)+'</b><span>sequência</span></div><div><b>'+gm_(it.gold_metrics.glue)+'</b><span>colado/solto</span></div><div><b>'+gm_(it.gold_metrics.lyric)+'</b><span>letra</span></div><div><b>'+(it.gold_metrics.exact_body?'sim':'não')+'</b><span>idêntico</span></div></div>':'';
  const canon=it.canonical?('letra canônica no recorte: '+(it.canonical.coverage==null?'sem letra no acervo':Math.round(it.canonical.coverage*100)+'% ('+it.canonical.matched+'/'+it.canonical.total+' linhas)')+(it.canonical.foreign_lines&&it.canonical.foreign_lines.length?' · linhas estranhas: '+it.canonical.foreign_lines.length:'')):'';
  document.getElementById('main').innerHTML=`
  <div class="head"><div><h2>${esc(it.hymn)} · ${esc(it.title)}</h2><div class="meta">${esc(it.kind||'')} · <code>${esc(it.pdf||'')}</code><br>cabeçalhos achados na página: ${it.headers.map(h=>esc(h[0])+' ('+esc(h[2])+')').join(', ')} · calha em ${it.gutter} pt · ${it.rects.length} retângulo(s)${it.crosses?' · <b>atravessa coluna</b>':''}<br>medido: ${it.lines} linhas de letra, ${it.bars} barras, ${it.chords} acordes (${it.unknown} ilegíveis para o OCR) · ${esc(canon)}</div></div>${pillFor(it)}</div>
  <div class="cols">
    <div class="box"><h3>Página do PDF (recorte marcado)</h3><div class="scroll"><img src="${it.page}" alt="página com recorte"></div></div>
    <div class="box"><h3>Crop que o leitor viu</h3><div class="scroll">${it.crop?'<img src="'+it.crop+'" alt="crop">':'<div class="meta">sem crop</div>'}</div></div>
    <div class="box"><h3>Extração</h3><div class="tabs"><button class="on" data-t="cifra">Cifra</button><button data-t="raw">ChordPro</button><button data-t="sk">Esqueleto medido</button>${it.gold?'<button data-t="gold">Diff × gabarito</button>':''}${it.notes?'<button data-t="notes">Notas do leitor</button>':''}</div>
      <div class="scroll" id="tab-cifra"><div class="cifra">${renderCifra(it.candidate)}</div></div>
      <div class="scroll" id="tab-raw" hidden><pre class="raw">${esc(it.candidate)}</pre></div>
      <div class="scroll" id="tab-sk" hidden><pre class="raw">${esc(it.skeleton)}</pre></div>
      ${it.gold?'<div class="scroll" id="tab-gold" hidden><div class="diff">'+diffLines(it.gold,it.candidate)+'</div></div>':''}
      ${it.notes?'<div class="scroll" id="tab-notes" hidden><pre class="raw">'+esc(it.notes)+'</pre></div>':''}
    </div>
  </div>
  <div class="checks">${checks}</div>${gm}
  <div class="verdict">
    <fieldset><legend>Crop</legend><label class="ok"><input type="radio" name="crop" value="ok" ${v.crop==='ok'?'checked':''}>certo</label><label class="bad"><input type="radio" name="crop" value="erro" ${v.crop==='erro'?'checked':''}>errado</label></fieldset>
    <fieldset><legend>Extração</legend><label class="ok"><input type="radio" name="ext" value="ok" ${v.ext==='ok'?'checked':''}>certa</label><label class="bad"><input type="radio" name="ext" value="erro" ${v.ext==='erro'?'checked':''}>com erro</label></fieldset>
    <div><legend style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">O que está errado (linha, acorde, letra)</legend><textarea id="note">${esc(v.note||'')}</textarea></div>
  </div>`;
  document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));['cifra','raw','sk','gold','notes'].forEach(t=>{const el=document.getElementById('tab-'+t);if(el)el.hidden=(t!==b.dataset.t);});}));
  document.querySelectorAll('.verdict input').forEach(r=>r.addEventListener('change',()=>{const vv=verdicts[it.id]||{};vv[r.name]=r.value;verdicts[it.id]=vv;save();}));
  document.getElementById('note').addEventListener('input',e=>{const vv=verdicts[it.id]||{};vv.note=e.target.value;verdicts[it.id]=vv;save();});
}
function gm_(x){return (x==null?'–':x.toFixed(3));}
function save(){try{localStorage.setItem(KEY,JSON.stringify(verdicts));}catch(e){} renderSummary();}
function renderSummary(){const rows=DATA.map(it=>{const v=verdicts[it.id]||{};return {louvor:it.hymn,titulo:it.title,edicao:it.kind,crop:v.crop||'',extracao:v.ext||'',nota:v.note||''};});document.getElementById('sum').value=JSON.stringify(rows,null,1);}
let sel=0;
document.getElementById('nav').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;sel=+b.dataset.i;renderNav(sel);renderItem(sel);window.scrollTo({top:0});});
document.getElementById('s-n').textContent=DATA.length;document.getElementById('s-cross').textContent=DATA.filter(i=>i.crosses).length;document.getElementById('s-ok').textContent=DATA.filter(i=>i.verify&&i.verify.ok).length;document.getElementById('s-gold').textContent=DATA.filter(i=>i.gold).length;
renderNav(0);renderItem(0);renderSummary();
</script>
"""


def main() -> None:
    root = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else "Rodada de validação"
    items = collect(root)
    html = TEMPLATE.replace("__TITLE__", title).replace("__DATA__", json.dumps(items, ensure_ascii=False)).replace("__ROUND__", json.dumps(os.path.basename(root.rstrip("/"))))
    out = os.path.join(root, "review.html")
    open(out, "w", encoding="utf-8").write(html)
    print(out, f"{os.path.getsize(out) / 1e6:.1f} MB", len(items), "louvores")


if __name__ == "__main__":
    main()
