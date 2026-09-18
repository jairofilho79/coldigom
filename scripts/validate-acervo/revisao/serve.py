"""Site local de revisão da migração PLPCG (spec §6).

`python3 -m revisao.serve` sobe http://localhost:8765 com uma página estática
(HTML + JS sem build) que lista os findings do `plpcg_crosswalk` agrupados por
louvor do PLPCG e mostra, lado a lado, o PDF do PLPCG e o PDF do candidato no
coldigom. `POST /decide` grava a decisão do dono em
`gabaritos/plpcg_crosswalk/decisoes.jsonl` (ver `revisao.decisoes`); o modo
gabarito e o `core.gold` ficam para depois. Nada aqui entra no coldigom web.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import urllib.parse
import webbrowser
from dataclasses import dataclass, field
from http.server import HTTPServer, SimpleHTTPRequestHandler

from core.paths import OUT, PKG, PLPCG_BAIXADOS, PLPCJF_ASSETS, SNAPSHOT_DB, STORAGE_PRAISES
from core.plpcg import arquivo_local, pdfs_em, url_publica
from detectors.plpcg_crosswalk import FAIXAS_CROSSWALK
from revisao import decisoes as dec

FINDINGS_PADRAO = os.path.join(OUT, "plpcg_crosswalk", "findings.jsonl")
GABARITO_RODADA1 = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "rodada1", "findings.jsonl")
DECISOES_PADRAO = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "decisoes.jsonl")
PAGINA = os.path.join(os.path.dirname(__file__), "index.html")
COLDIGOM_WEB = "https://coldigom-web.pages.dev/praise/"

# Quanto mais grave a pior faixa de um louvor, mais no topo ele aparece na
# ordenação "por atenção" da página.
GRAVIDADE = {"faltante": 0, "ambiguo": 1, "media": 2, "sem_louvor": 3, "alta": 4}

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@dataclass
class Dados:
    run_id: str
    checksum: str
    resumo: dict[str, int]
    grupos: list[dict]
    criar: list[dict]
    praises: dict[str, dict]
    origem: str = ""
    avisos: list[str] = field(default_factory=list)
    decisoes: dict[str, dict] = field(default_factory=dict)
    homonimos: dict[str, list[dict]] = field(default_factory=dict)  # pdf_id/group_id → praises com nome igual/parecido
    kinds: list[str] = field(default_factory=list)
    tipos: tuple[str, ...] = dec.TIPOS
    kind_padrao: dict[str, str] = field(default_factory=lambda: dict(dec.KIND_PADRAO))

    def json(self) -> bytes:
        return json.dumps(self.__dict__, ensure_ascii=False).encode("utf-8")


def _ler_findings(caminho: str) -> list[dict]:
    with open(caminho, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def indice_storage(storage: str) -> dict[str, str]:
    """material_id → PDF no espelho local.

    O espelho é <praise_id>/<material_id>.pdf de quando foi feito; um material
    movido por merge continua na pasta do praise antigo. O id do material é o
    que não muda, então é por ele que se procura.
    """
    if not os.path.isdir(storage):
        return {}
    return {os.path.basename(rel)[:-4]: abs_ for rel, abs_ in pdfs_em(storage).items()}


def _nomes(snapshot: str) -> dict[str, tuple[str, str]]:
    conn = sqlite3.connect(snapshot)
    try:
        return {r[0]: (r[1] or "", r[2] or "") for r in conn.execute("SELECT id, name, number FROM praises")}
    finally:
        conn.close()


def _kinds(snapshot: str) -> list[str]:
    conn = sqlite3.connect(snapshot)
    try:
        return [r[0] for r in conn.execute("SELECT name FROM material_kinds ORDER BY name")]
    finally:
        conn.close()


def _louvores(snapshot: str, ids: set[str], indice: dict[str, str]) -> dict[str, dict]:
    """Nome, número, tags e materiais dos praises que os findings citam."""
    if not ids:
        return {}
    conn = sqlite3.connect(snapshot)
    conn.row_factory = sqlite3.Row
    out: dict[str, dict] = {}
    marcas = ",".join("?" * len(ids))
    ordem = list(ids)
    for r in conn.execute(f"SELECT id, name, number FROM praises WHERE id IN ({marcas})", ordem):
        out[r["id"]] = {"id": r["id"], "name": r["name"], "number": r["number"] or "",
                        "tags": [], "materiais": []}
    for r in conn.execute(
        f"SELECT pt.praise_id, t.name FROM praise_tags pt JOIN tags t ON t.id = pt.tag_id "
        f"WHERE pt.praise_id IN ({marcas}) ORDER BY t.name", ordem):
        if r["praise_id"] in out:
            out[r["praise_id"]]["tags"].append(r["name"])
    for r in conn.execute(
        f"SELECT m.id, m.praise_id, m.type, m.is_reviewed, COALESCE(k.name, m.material_kind) AS kind "
        f"FROM praise_materials m LEFT JOIN material_kinds k ON k.id = m.material_kind "
        f"WHERE m.praise_id IN ({marcas}) ORDER BY kind, m.id", ordem):
        if r["praise_id"] not in out:
            continue
        out[r["praise_id"]]["materiais"].append(
            {"id": r["id"], "kind": r["kind"], "type": r["type"],
             "is_reviewed": r["is_reviewed"], "local": r["id"] in indice})
    conn.close()
    return out


def _chave_grupo(g: dict) -> tuple:
    num = g["numero"]
    return (0, int(num)) if num.isdigit() else (1, g["nome"].lower())


def carregar(findings: str, snapshot: str = SNAPSHOT_DB, storage: str = STORAGE_PRAISES,
             plpcjf: str = PLPCJF_ASSETS, baixados: str = PLPCG_BAIXADOS,
             decisoes: str = DECISOES_PADRAO) -> Dados:
    linhas = _ler_findings(findings)
    resumo = {f: 0 for f in FAIXAS_CROSSWALK}
    grupos: dict[str, dict] = {}
    criar: list[dict] = []
    ids: set[str] = set()
    run_id = checksum = ""

    for f in linhas:
        e = f["evidence"]
        run_id, checksum = f["run_id"], e.get("checksum", "")
        if f["target_type"] == "plpcg_grupo":
            item = {"group_id": f["target_id"], "finding_id": f["finding_id"], **e}
            criar.append(item)
            if e.get("parecido"):
                ids.add(e["parecido"]["praise_id"])
            continue
        resumo[e["faixa"]] += 1
        entrada = {
            "pdf_id": f["target_id"], "finding_id": f["finding_id"], "action": f["action"],
            "confidence": f["confidence"], "praise_id": f["praise_id"], "proposed": f["proposed"],
            "local": arquivo_local(e["path"], plpcjf, baixados) is not None,
            "url": url_publica(e["path"]),
            **{k: v for k, v in e.items() if k != "checksum"},
        }
        if f["praise_id"]:
            ids.add(f["praise_id"])
        for c in e["candidatos"]:
            ids.add(c["praise_id"])
        g = grupos.setdefault(e["group_id"], {
            "group_id": e["group_id"], "nome": e["nome"], "numero": e["numero"],
            "classificacao": e["classificacao"], "pior": "alta", "entradas": []})
        g["entradas"].append(entrada)
        if GRAVIDADE[e["faixa"]] < GRAVIDADE[g["pior"]]:
            g["pior"] = e["faixa"]

    for g in grupos.values():
        g["entradas"].sort(key=lambda x: x["short_id"])
    lista = sorted(grupos.values(), key=_chave_grupo)
    criar.sort(key=lambda x: x["nome"].lower())
    decididas = dec.ler(decisoes)
    # praises que só as decisões citam (o dono escolheu um candidato que o finding não propunha)
    ids |= {d["praise_id"] for d in decididas.values() if d.get("praise_id")}
    # homônimos/parecidos para tudo que pode virar "criar": entradas sem alvo e louvores novos
    indice = dec.indice_nomes(_nomes(snapshot))
    hom: dict[str, list[dict]] = {}
    for g in lista:
        for e in g["entradas"]:
            d = decididas.get(e["pdf_id"], {})
            if not e["praise_id"] or d.get("tipo") == "criar":
                # pelo nome do PLPCG e, se o dono renomeou ao criar, pelo nome novo também
                hs = {h["praise_id"]: h for n in {e["nome"], d.get("nome") or e["nome"]} for h in dec.homonimos(n, indice)}
                hom[e["pdf_id"]] = sorted(hs.values(), key=lambda h: (-h["score"], h["name"]))
    for g in criar:
        hom[g["group_id"]] = dec.homonimos(g["nome"], indice)
    hom = {k: v for k, v in hom.items() if v}
    ids |= {h["praise_id"] for hs in hom.values() for h in hs}
    return Dados(run_id=run_id, checksum=checksum, resumo=resumo, grupos=lista, criar=criar,
                 praises=_louvores(snapshot, ids, indice_storage(storage)), origem=findings,
                 decisoes=decididas, kinds=_kinds(snapshot), homonimos=hom)


def _dentro(raiz: str, caminho: str) -> bool:
    raiz = os.path.realpath(raiz)
    return os.path.realpath(caminho).startswith(raiz + os.sep)


def caminho_pdf_plpcg(caminho: str, plpcjf: str = PLPCJF_ASSETS, baixados: str = PLPCG_BAIXADOS) -> str | None:
    """O PDF do PLPCG no disco, ou None se não existe ou tenta sair das raízes."""
    if ".." in caminho.split("/") or caminho.startswith("/"):
        return None
    p = arquivo_local(caminho, plpcjf, baixados)
    if p and (_dentro(plpcjf, p) or _dentro(baixados, p)):
        return p
    return None


def caminho_pdf_coldigom(material_id: str, indice: dict[str, str]) -> str | None:
    if not UUID.match(material_id):
        return None
    p = indice.get(material_id)
    return p if p and os.path.isfile(p) else None


def fazer_handler(dados: Dados, plpcjf: str, baixados: str, storage: str,
                  decisoes: str = DECISOES_PADRAO):
    cache = {"corpo": dados.json()}
    indice = indice_storage(storage)
    kinds = set(dados.kinds)

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, fmt, *args):  # só erros no terminal
            if args and str(args[1]).startswith(("4", "5")):
                sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

        def _enviar(self, status: int, tipo: str, conteudo: bytes, extra: dict | None = None):
            self.send_response(status)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(conteudo)))
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(conteudo)

        def _arquivo(self, caminho: str, tipo: str):
            with open(caminho, "rb") as f:
                self._enviar(200, tipo, f.read(), {"Content-Disposition": "inline"})

        def do_GET(self):
            url = urllib.parse.urlsplit(self.path)
            rota = urllib.parse.unquote(url.path)
            if rota in ("/", "/index.html"):
                return self._arquivo(PAGINA, "text/html; charset=utf-8")
            if rota == "/api/dados":
                if cache["corpo"] is None:
                    cache["corpo"] = dados.json()
                return self._enviar(200, "application/json; charset=utf-8", cache["corpo"])
            if rota.startswith("/pdf/plpcg/"):
                p = caminho_pdf_plpcg(rota[len("/pdf/plpcg/"):], plpcjf, baixados)
                if p:
                    return self._arquivo(p, "application/pdf")
                return self._enviar(404, "text/plain; charset=utf-8", b"PDF do PLPCG nao esta no disco")
            m = re.match(r"^/pdf/coldigom/([^/]+)$", rota)
            if m:
                p = caminho_pdf_coldigom(m.group(1), indice)
                if p:
                    return self._arquivo(p, "application/pdf")
                return self._enviar(404, "text/plain; charset=utf-8", b"PDF do coldigom nao esta em storage/")
            self._enviar(404, "text/plain; charset=utf-8", b"nao existe")

        def do_POST(self):
            if urllib.parse.urlsplit(self.path).path != "/decide":
                return self._enviar(404, "text/plain; charset=utf-8", b"nao existe")
            try:
                bruto = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                d = dec.validar(json.loads(bruto.decode("utf-8")), kinds)
            except (ValueError, json.JSONDecodeError) as erro:
                return self._enviar(400, "text/plain; charset=utf-8", str(erro).encode("utf-8"))
            dec.gravar(decisoes, d)
            dados.decisoes[dec.chave(d)] = d
            cache["corpo"] = None
            self._enviar(200, "application/json; charset=utf-8", json.dumps(d, ensure_ascii=False).encode("utf-8"))

    return Handler


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--findings", default=None,
                    help=f"findings.jsonl do plpcg_crosswalk (padrão: {FINDINGS_PADRAO}, senão o gabarito da rodada 1)")
    ap.add_argument("--snapshot", default=SNAPSHOT_DB)
    ap.add_argument("--storage", default=STORAGE_PRAISES, help="espelho local <praise_id>/<material_id>.pdf")
    ap.add_argument("--plpcjf", default=PLPCJF_ASSETS, help="assets/ do plpcjf")
    ap.add_argument("--baixados", default=PLPCG_BAIXADOS, help="cache dos PDFs que só existem no R2")
    ap.add_argument("--decisoes", default=DECISOES_PADRAO, help="decisoes.jsonl (append-only, entra no git)")
    ap.add_argument("--porta", type=int, default=8765)
    ap.add_argument("--abrir", action="store_true", help="abre o navegador")
    a = ap.parse_args(argv)

    findings = a.findings or (FINDINGS_PADRAO if os.path.exists(FINDINGS_PADRAO) else GABARITO_RODADA1)
    if not os.path.exists(findings):
        print(f"sem findings: rode python3 -m detectors.plpcg_crosswalk antes ({findings})", file=sys.stderr)
        return 1
    if not os.path.exists(a.snapshot):
        print(f"sem snapshot: rode python3 -m core.snapshot antes ({a.snapshot})", file=sys.stderr)
        return 1

    dados = carregar(findings, a.snapshot, a.storage, a.plpcjf, a.baixados, a.decisoes)
    decididas = sum(1 for d in dados.decisoes.values() if d.get("tipo"))
    print(f"findings: {findings}\ndecisoes: {a.decisoes} ({decididas} decididas, "
          f"{len(dados.decisoes) - decididas} em Revisão 2)\nrun_id: {dados.run_id}\n"
          f"louvores do PLPCG: {len(dados.grupos)} · entradas: {sum(dados.resumo.values())} · "
          f"a criar: {len(dados.criar)}\n"
          + " · ".join(f"{k} {v}" for k, v in dados.resumo.items()))
    url = f"http://localhost:{a.porta}/"
    servidor = HTTPServer(("127.0.0.1", a.porta),
                          fazer_handler(dados, a.plpcjf, a.baixados, a.storage, a.decisoes))
    print(f"\n{url}  (Ctrl+C para parar)")
    if a.abrir:
        webbrowser.open(url)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
