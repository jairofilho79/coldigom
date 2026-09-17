"""Decisões do dono sobre cada PDF do PLPCG (spec §6, Fase B).

`gabaritos/plpcg_crosswalk/decisoes.jsonl` é append-only: a última linha por
`pdf_id` (ou por `group_id`, para os louvores novos) vale. É gabarito humano —
entra no git, nunca fica só em `out/`. O `apply` da Fase C lê daqui.

Uma linha tem `tipo` em TIPOS quando o dono decidiu, ou `tipo: null` com
`duvida` preenchida quando a migração das anotações da rodada 1 não conseguiu
decidir sozinha — é isso que o filtro "Revisão 2" do site lista.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime, timezone

from core.normalize import norm_nome

# O vocabulário que o dono usou nas anotações da rodada 1, virado botão.
#   link       – o arquivo já está no coldigom (hash idêntico): só vincula
#   adicionar  – importar como material novo do praise (variante que ele não quer perder)
#   substituir – importar e remover o material do coldigom que está errado
#   criar      – criar praise novo com esse material
#   nao_levar  – não sobe de jeito nenhum ("não precisa levar", "manter o do coldigom")
#   descartar  – o PDF é lixo (em branco, duplicado)
TIPOS = ("link", "adicionar", "substituir", "criar", "nao_levar", "descartar")
COM_KIND = ("adicionar", "substituir", "criar")

# Kind padrão por categoria do PLPCG. Partitura é Choir, não Sheet Music: das
# 84 vezes que o dono nomeou o kind de uma partitura na rodada 1, 77 foram Choir.
KIND_PADRAO = {
    "Partitura": "Choir", "Cifra": "Chord Chart", "Cifra nível I": "Chord Chart I",
    "Cifra nível II": "Chord Chart II", "Gestos em Gravura": "CIAs Gestures",
}
# Como o dono escreve o kind nas anotações → nome no coldigom.
_KIND_TEXTO = [
    (r"coro e piano|choir and piano", "Choir and Piano"),
    (r"music sheet|sheet music|partitura de piano", "Sheet Music"),
    (r"\bchoir\b|\bcoro\b", "Choir"),
    (r"\bcifra\b|chord chart", "Chord Chart"),
]

SHORT_ID = re.compile(r"^[0-9a-f]{4}$")
CAMPOS = ("pdf_id", "group_id", "short_id", "tipo", "praise_id", "material_id", "kind",
          "junto_com", "nome", "tags", "motivo", "duvida", "proposta", "confirma", "origem", "marca_rodada1", "quando")
# `confirma: "homonimo"` = o dono viu, no modo Revisão 3, que existe praise com
# nome igual/parecido no coldigom e manteve "criar" mesmo assim.


def agora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def chave(d: dict) -> str:
    return d.get("pdf_id") or d.get("group_id") or ""


def ler(caminho: str) -> dict[str, dict]:
    """Última decisão por pdf_id/group_id."""
    out: dict[str, dict] = {}
    if not os.path.exists(caminho):
        return out
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            if linha.strip():
                d = json.loads(linha)
                out[chave(d)] = d
    return out


def validar(d: dict, kinds: set[str] | None = None) -> dict:
    """Normaliza e valida uma decisão vinda do site. Levanta ValueError."""
    if bool(d.get("pdf_id")) == bool(d.get("group_id")):
        raise ValueError("exatamente um de pdf_id ou group_id")
    tipo = d.get("tipo")
    if tipo is not None and tipo not in TIPOS:
        raise ValueError(f"tipo desconhecido: {tipo!r}")
    if tipo is None and not (d.get("duvida") or "").strip() and not d.get("desfazer"):
        raise ValueError("sem tipo só com duvida ou desfazer")
    saida = {k: d.get(k) for k in CAMPOS}
    for k in ("praise_id", "material_id", "kind", "junto_com", "nome", "motivo", "duvida", "proposta", "confirma"):
        saida[k] = (saida[k] or "").strip() or None
    saida["tags"] = [t for t in (saida["tags"] or []) if t] or None
    if tipo in ("nao_levar", "descartar"):  # nada sobe: alvo e kind são ruído para o apply
        for k in ("praise_id", "material_id", "kind", "junto_com"):
            saida[k] = None
    if tipo == "link":
        saida["kind"] = None
    if tipo == "criar":  # praise novo: o candidato que estava na tela não é alvo de nada
        saida["praise_id"] = saida["material_id"] = None
    if tipo in COM_KIND:
        if not saida["kind"]:
            raise ValueError(f"{tipo} precisa de kind")
        if kinds and saida["kind"] not in kinds:
            raise ValueError(f"kind não existe no coldigom: {saida['kind']!r}")
    if tipo in ("adicionar", "substituir") and not (saida["praise_id"] or saida["junto_com"]):
        raise ValueError(f"{tipo} precisa de praise_id ou junto_com")
    if tipo in ("substituir", "link") and not saida["material_id"]:
        raise ValueError(f"{tipo} precisa de material_id")
    if tipo == "criar" and not saida["nome"]:
        raise ValueError("criar precisa de nome")
    if saida["junto_com"] and saida["junto_com"] == saida["pdf_id"]:
        raise ValueError("junto_com aponta para a própria entrada")
    saida["origem"] = saida["origem"] or "site"
    saida["quando"] = agora()
    return saida


def gravar(caminho: str, d: dict) -> None:
    os.makedirs(os.path.dirname(caminho) or ".", exist_ok=True)
    with open(caminho, "a", encoding="utf-8") as f:
        f.write(json.dumps(d, ensure_ascii=False) + "\n")


# --- migração das anotações da rodada 1 (localStorage → decisoes.jsonl) ---

def _ascii(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def classe_texto(texto: str) -> str:
    """O que o dono quis dizer, pelo texto. A marca ✓/✗ não conta: ele disse
    que a usou como 'onde eu estava', não como veredito."""
    t = _ascii(texto)
    if not t.strip():
        return "sem_texto"
    if re.search(r"em branco|excluir", t):
        return "descartar"
    if re.search(r"nao (precisa|levar)|pode descartar|nao levar", t):
        return "nao_levar"
    if re.search(r"\bmant(er|enha)\b", t):
        return "nao_levar"
    if re.search(r"substitu|subtitu", t):
        return "substituir"
    if re.search(r"outro louvor|louvores diferentes|sugest[oa]es estao erradas", t):
        return "criar_outro"
    if re.search(r"cri(ar|e) (o |um |esse )?(novo )?praise|criar praise", t):
        return "criar"
    if re.search(r"junto com|no mesmo|\bno [0-9a-f]{4}\b", t):
        return "junto"
    if re.search(r"adicion|coloque|levar como|cri(e|ar) (como|esse|novo)|deve virar|novo material", t):
        return "adicionar"
    return "outro"


def kind_do_texto(texto: str, categoria: str) -> str | None:
    t = _ascii(texto)
    for padrao, kind in _KIND_TEXTO:
        if re.search(padrao, t):
            if kind == "Chord Chart" and categoria.startswith("Cifra nível"):
                return KIND_PADRAO[categoria]
            return kind
    return None


def _alvo(e: dict) -> tuple[str | None, str | None]:
    """praise/material que o finding propõe (ou o único candidato)."""
    f = e
    praise = f.get("praise_id")
    material = f["evidence"].get("material_id")
    cands = f["evidence"].get("candidatos") or []
    if not praise and len({c["praise_id"] for c in cands}) == 1:
        praise = cands[0]["praise_id"]
    return praise, material


def migrar(anotacoes: dict[str, dict], findings: list[dict], praises: dict[str, str]) -> list[dict]:
    """Anotações {pdf_id: {marca, texto}} → decisões, com `duvida` onde eu não
    consigo decidir sozinho. `praises` é {praise_id: nome} do snapshot, para
    avisar quando 'criar praise' colide com um nome que já existe."""
    por_pdf = {f["target_id"]: f for f in findings if f["target_type"] == "plpcg"}
    por_short = {f["evidence"]["short_id"]: f["target_id"] for f in por_pdf.values()}
    nomes_coldigom: dict[str, list[str]] = {}
    for pid, nome in praises.items():
        nomes_coldigom.setdefault(norm_nome(nome), []).append(pid)
    saida: list[dict] = []
    criados: dict[str, str] = {}  # nome normalizado → pdf_id da primeira entrada que cria o praise

    for pdf_id, an in anotacoes.items():
        f = por_pdf.get(pdf_id)
        if not f:
            continue
        e = f["evidence"]
        texto = (an.get("texto") or "").strip()
        marca = an.get("marca") or ""
        cl = classe_texto(texto)
        praise, material = _alvo(f)
        cat = e["categoria"]
        kind = kind_do_texto(texto, cat) or KIND_PADRAO.get(cat)
        cands = e.get("candidatos") or []
        quais = ", ".join(sorted({praises.get(c["praise_id"], c["praise_id"][:8]) for c in cands})) or "nenhum candidato"
        d = {"pdf_id": pdf_id, "short_id": e["short_id"], "tipo": None, "praise_id": None,
             "material_id": None, "kind": None, "junto_com": None, "nome": None, "tags": None,
             "motivo": texto or None, "duvida": None, "proposta": None,
             "origem": "rodada1-texto", "marca_rodada1": marca or None}
        duvidas: list[str] = []

        def decidir(tipo: str, **kw):
            d["tipo"] = tipo
            d.update(kw)

        if cl == "sem_texto":
            if marca == "erro":
                duvidas.append("marcado ✗ sem texto: descartar, criar praise ou adicionar?")
                d["proposta"] = "descartar"
            elif e["faixa"] == "alta" and material:
                decidir("link", praise_id=praise, material_id=material)
            elif praise:
                decidir("adicionar", praise_id=praise, kind=kind)
            else:
                duvidas.append(f"sem texto e sem praise alvo — em qual praise adicionar, ou criar? candidatos: {quais}")
                d["proposta"] = "adicionar"
        elif cl == "descartar":
            decidir("descartar")
        elif cl == "nao_levar":
            decidir("nao_levar")
        elif cl == "substituir":
            if material:
                decidir("substituir", praise_id=praise, material_id=material, kind=kind)
            else:
                duvidas.append(f"'substituir', mas o finding não aponta um material — clique no material a remover e confirme ({len(cands)} candidatos)")
                d["proposta"] = "substituir"
        elif cl in ("criar", "criar_outro"):
            d.update(nome=e["nome"], kind=kind, proposta="criar")
            if cl == "criar" and praise and marca != "erro":
                duvidas.append(f"o detector casou com o praise '{praises.get(praise, praise)}' "
                               f"({'+'.join(e['evidencias'])}); você pediu criar praise novo — é outro louvor, "
                               "ou era para adicionar nele?")
            iguais = nomes_coldigom.get(norm_nome(e["nome"]))
            if iguais and (not praise or praise not in iguais):
                duvidas.append(f"já existe praise com esse nome no coldigom ({', '.join(p[:8] for p in iguais)}) — "
                               "criar mesmo assim ou adicionar nele?")
            if not duvidas:
                decidir("criar")
        elif cl == "junto":
            refs = [por_short[s] for s in re.findall(r"\b([0-9a-f]{4})\b", texto) if s in por_short]
            if refs:
                d["proposta"] = "adicionar"
                if praise and "criar" not in _ascii(texto):
                    decidir("adicionar", praise_id=praise, kind=kind, junto_com=refs[0])
                else:
                    decidir("adicionar", kind=kind, junto_com=refs[0])
            else:
                duvidas.append("'junto com' sem short_id que eu reconheça — junto com qual entrada?")
                d["proposta"] = "adicionar"
        elif cl == "adicionar":
            if praise:
                decidir("adicionar", praise_id=praise, kind=kind)
            else:
                duvidas.append(f"'adicionar', mas nenhum praise alvo no finding — em qual praise? candidatos: {quais}")
                d["proposta"] = "adicionar"
        else:
            duvidas.append(f"não entendi o texto: {texto!r}")

        if cat == "Partitura" and kind_do_texto(texto, cat) in ("Chord Chart",):
            duvidas.append("é Partitura, mas você pediu Cifra — o kind é Choir ou Chord Chart?")
            d["proposta"] = d["proposta"] or d["tipo"]
            d["tipo"] = None

        if d["tipo"] == "criar":
            n = norm_nome(e["nome"])
            if n in criados:
                d["tipo"], d["junto_com"] = "adicionar", criados[n]
            else:
                criados[n] = pdf_id

        d["duvida"] = " | ".join(duvidas) or None
        if d["tipo"]:
            d["proposta"] = None
        d["quando"] = agora()
        saida.append(d)
    return saida


# --- homônimos e parecidos no coldigom (modo Revisão 3) ---

def indice_nomes(praises: dict[str, tuple[str, str]]) -> dict:
    """praises = {id: (nome, número)} → índices por nome normalizado e por palavra."""
    exato: dict[str, list[str]] = {}
    por_palavra: dict[str, set[str]] = {}
    palavras: dict[str, set[str]] = {}
    for pid, (nome, _) in praises.items():
        n = norm_nome(nome)
        exato.setdefault(n, []).append(pid)
        ps = set(n.split())
        palavras[pid] = ps
        for w in ps:
            por_palavra.setdefault(w, set()).add(pid)
    return {"praises": praises, "exato": exato, "por_palavra": por_palavra, "palavras": palavras}


_VAZIAS = {"a", "o", "e", "de", "da", "do", "em", "que", "ao", "os", "as", "um", "uma", "no", "na", "meu", "minha", "teu", "tua", "es"}


def homonimos(nome: str, indice: dict, minimo: float = 0.6, maximo: int = 6) -> list[dict]:
    """Praises do coldigom com o mesmo nome (score 1) ou parecido (Jaccard das
    palavras, ignorando as vazias), do mais parecido ao menos. É o "vasculhar
    outros no coldigom" que o dono pediu para decidir criar × adicionar."""
    n = norm_nome(nome)
    ps = set(n.split()) - _VAZIAS or set(n.split())
    scores: dict[str, float] = {pid: 1.0 for pid in indice["exato"].get(n, [])}
    candidatos: set[str] = set()
    for w in ps:
        candidatos |= indice["por_palavra"].get(w, set())
    for pid in candidatos:
        if pid in scores:
            continue
        outras = indice["palavras"][pid] - _VAZIAS or indice["palavras"][pid]
        j = len(ps & outras) / len(ps | outras)
        if j >= minimo:
            scores[pid] = round(j, 2)
    out = [{"praise_id": pid, "name": indice["praises"][pid][0], "number": indice["praises"][pid][1] or "", "score": sc}
           for pid, sc in sorted(scores.items(), key=lambda x: (-x[1], indice["praises"][x[0]][0]))]
    return out[:maximo]
