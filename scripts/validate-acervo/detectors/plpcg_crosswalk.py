from __future__ import annotations

import argparse
import difflib
import os
import re
import sqlite3
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from core.findings import Finding, Motivos, write_findings
from core.paths import HASHES_DB, OUT, PLPCG_DB, SNAPSHOT_DB, ensure_out
from core.plpcg import (
    LADO_PLPCG,
    abrir_hashes,
    conectar as conectar_plpcg,
    entradas,
    hashes_coldigom,
    hashes_de,
    meta,
)
from core.snapshot import conectar

DETECTOR = "plpcg_crosswalk"

# categoria do PLPCG → kind que a ingestão original deu ao mesmo arquivo
# (medido no spike: Cifra I 1034/1034, Cifra II 1031/1031, Gestos 254/254).
KIND_ESPERADO = {
    "Partitura": "Sheet Music",
    "Cifra nível I": "Chord Chart I",
    "Cifra nível II": "Chord Chart II",
    "Gestos em Gravura": "CIAs Gestures",
    "Cifra": "Chord Chart",
}

# … e a família que ainda conta como "o mesmo tipo de material": a partitura
# avulsa entrou como Choir/Score; uma 'Cifra' sem nível pode ser I ou II.
FAMILIA = {
    "Partitura": {"Sheet Music", "Choir", "Score"},
    "Cifra nível I": {"Chord Chart I"},
    "Cifra nível II": {"Chord Chart II"},
    "Gestos em Gravura": {"CIAs Gestures"},
    "Cifra": {"Chord Chart", "Chord Chart I", "Chord Chart II"},
}

# Prefixo do caminho decodificado do PLPCG → prefixos do csvmap onde o mesmo
# arquivo pode estar. 'assets/…' e as pastas datadas (04112025/…) não têm
# par no csvmap: entram só por número/nome e por hash.
PREFIXO_CSV = {
    "ColAdultos": ("Coletânea",),
    "Louvores Coletânea de Partituras": ("Coletânea",),
    "ColCIAs": ("Coletânea CIAs",),
    "Louvores Coletânea CIAs": ("Coletânea CIAs",),
    "Avulsos": ("Avulsos Diversos", "Avulsos PES", "Coletânea PES",
                "Avulsos PES CIAs", "Avulsos Migrados", "GLTM"),
    "Adicionados": ("Avulsos Diversos", "Avulsos Migrados", "Avulsos PES", "GLTM"),
}

# classificação (sem o parêntese) → tags de um praise criado a partir dela
TAGS_POR_CLASSE = {
    "Coletânea Adultos": ("Coletânea",),
    "Coletânea CIAs": ("Coletânea", "CIAs"),
    "PES": ("PES",),
    "PES CIAs": ("PES", "CIAs"),
}

CATEGORIAS = ("Partitura", "Cifra nível I", "Cifra nível II", "Cifra", "Gestos em Gravura")

FAIXAS_CROSSWALK = ("alta", "media", "faltante", "ambiguo", "sem_louvor")

# faixa do cruzamento (spec §5.1) → (confidence do contrato, ação).
# faltante e sem_louvor entram como 'alta' porque o dono decidiu (D4) que
# importação e criação são automáticas; o portão deles é a pré-visualização
# no site e o undo, não a faixa.
CONTRATO = {
    "alta": ("alta", "link_plpcg"),
    "media": ("media", "link_plpcg"),
    "faltante": ("alta", "import_plpcg_material"),
    "ambiguo": ("baixa", "link_plpcg"),
    "sem_louvor": ("media", "import_plpcg_material"),
}

# Continência ('a-ti-que-habitas' dentro de 'a-ti-que-habitas-entre-os-
# querubins') só com 10+ chars: abaixo disso 'deus' está em meio acervo.
CONTINENCIA_MINIMA = 10
SIMILARIDADE_MINIMA = 0.8
MAX_CANDIDATOS = 5

# As evidências que são do louvor (Camada L), não do material.
EVIDENCIAS_L = ("num", "nome", "nome~", "slug", "classe")


# --- normalização -------------------------------------------------------------

def slug(s: str | None) -> str:
    """Igual ao slug do group_id do PLPCG: ascii, minúsculas, hífens."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def numero_int(s: str | None) -> int | None:
    m = re.match(r"\s*(\d+)", s or "")
    return int(m.group(1)) if m else None


def classe_base(classificacao: str) -> str:
    """'PES (Trombetas e Festas 2025)' → 'PES'."""
    return classificacao.split(" (")[0]


def classe_ok(classificacao: str, tags: set[str]) -> bool:
    """A tag é desempate, não chave (spec §2.2): só filtra quando o mapa
    conhece a classe; fora dele, não opina."""
    base = classe_base(classificacao)
    if base == "Coletânea Adultos":
        return "Coletânea" in tags and "CIAs" not in tags and "PES" not in tags
    if base == "Coletânea CIAs":
        return "Coletânea" in tags and "CIAs" in tags
    if base == "PES":
        return "PES" in tags and "CIAs" not in tags
    if base == "PES CIAs":
        return "PES" in tags and "CIAs" in tags
    if base == "Avulsos Diversos":
        return "Coletânea" not in tags or "Avulsos" in tags
    return True


def tags_propostas(classificacao: str) -> list[str]:
    tags = set(TAGS_POR_CLASSE.get(classe_base(classificacao), ("Avulsos",)))
    if "(GLTM)" in classificacao:
        tags.add("GLTM")
    return sorted(tags)


# --- Camada P: chaves de caminho ---------------------------------------------

def _sem_numero(pasta: str) -> str:
    return slug(re.sub(r"^\d+\s*-\s*", "", pasta))


def chaves_csv(file_path: str) -> list[tuple]:
    """Chaves sob as quais uma linha do csvmap fica indexada:
    (prefixo, número da pasta, basename) e (prefixo, slug da pasta, basename)."""
    segs = file_path.split("/")
    if len(segs) < 2:
        return []
    pref, base = segs[0].strip(), slug(segs[-1])
    pasta = segs[1] if len(segs) >= 3 else ""
    chaves: list[tuple] = []
    n = numero_int(pasta)
    if n is not None:
        chaves.append((pref, n, base))
    chaves.append((pref, _sem_numero(pasta), base))
    return chaves


def chaves_plpcg(caminho: str, numero: int | None) -> list[tuple]:
    """As chaves do csvmap que o caminho do PLPCG pode ter.

    'ColAdultos/031.pdf' é a partitura da coletânea, que no csvmap é
    'Coletânea /031 - Nome/Partitura.pdf' — o número vem do louvor, não do
    caminho. Os outros prefixos guardam a pasta do louvor no caminho.
    """
    segs = caminho.split("/")
    prefs = PREFIXO_CSV.get(segs[0], ())
    chaves: list[tuple] = []
    if segs[0] in ("ColAdultos", "ColCIAs"):
        if numero is not None:
            chaves += [(cp, numero, "partitura-pdf") for cp in prefs]
    elif len(segs) >= 3:
        pasta, base, n = segs[1], slug(segs[-1]), numero_int(segs[1])
        for cp in prefs:
            if n is not None:
                chaves.append((cp, n, base))
            chaves.append((cp, _sem_numero(pasta), base))
    return chaves


# --- o acervo do coldigom, indexado ------------------------------------------

@dataclass
class Acervo:
    praises: dict[str, dict]                              # id -> {id, name, number}
    slug_de: dict[str, str]                               # praise_id -> slug(name)
    tags: dict[str, set[str]]                             # praise_id -> nomes de tag
    materiais: dict[str, list[tuple[str, str | None, str]]]  # praise_id -> [(mid, kind, type)]
    praise_do_material: dict[str, str]
    por_numero: dict[int, list[str]]
    por_slug: dict[str, list[str]]
    chave_csv: dict[tuple, set[str]]                      # chave -> {material_id}

    @classmethod
    def carregar(cls, conn: sqlite3.Connection) -> "Acervo":
        kind_nome = {r["id"]: r["name"] for r in conn.execute("SELECT id, name FROM material_kinds")}
        praises = {r["id"]: dict(r) for r in conn.execute("SELECT id, name, number FROM praises")}
        slug_de = {pid: slug(p["name"]) for pid, p in praises.items()}

        tags: dict[str, set[str]] = defaultdict(set)
        for r in conn.execute(
            "SELECT pt.praise_id, t.name FROM praise_tags pt JOIN tags t ON t.id = pt.tag_id"
        ):
            tags[r[0]].add(r[1])

        materiais: dict[str, list] = defaultdict(list)
        praise_do_material: dict[str, str] = {}
        # ORDER BY id: a ordem dos materiais entra na evidência e precisa ser estável
        for r in conn.execute(
            "SELECT id, praise_id, material_kind, type FROM praise_materials ORDER BY id"
        ):
            materiais[r["praise_id"]].append((r["id"], kind_nome.get(r["material_kind"]), r["type"]))
            praise_do_material[r["id"]] = r["praise_id"]

        por_numero: dict[int, list[str]] = defaultdict(list)
        por_slug: dict[str, list[str]] = defaultdict(list)
        for pid, p in sorted(praises.items()):
            n = numero_int(p["number"])
            if n is not None:
                por_numero[n].append(pid)
            por_slug[slug_de[pid]].append(pid)

        chave_csv: dict[tuple, set[str]] = defaultdict(set)
        if conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'csvmap'").fetchone():
            for r in conn.execute(
                "SELECT file_path, praise_material_id FROM csvmap "
                "WHERE praise_material_id IS NOT NULL AND praise_material_id != ''"
            ):
                for k in chaves_csv(r["file_path"]):
                    chave_csv[k].add(r["praise_material_id"])

        return cls(praises, slug_de, dict(tags), dict(materiais), praise_do_material,
                   dict(por_numero), dict(por_slug), dict(chave_csv))


# --- Camada L: o louvor -------------------------------------------------------

def candidatos_louvor(
    group_id: str, classificacao: str, numero: str, acervo: Acervo
) -> tuple[list[str], list[str], bool]:
    """Praises do coldigom para um grupo do PLPCG: (ids, evidências, aproximado).

    Número primeiro, em todas as classes — o arranjo PES do 586 está no
    coldigom só como Coletânea, e filtrar por classe antes do número o
    perdia. Slug e classe são desempate. Só sem número e sem nome exato é
    que o nome aproximado entra, e ele é marcado: nunca vira alta sozinho.
    """
    gnum, gslug = group_id.split(":", 1)
    n = int(gnum) if gnum.isdigit() else None
    evid: list[str] = []

    def afunilar(c: list[str]) -> list[str]:
        if len(c) > 1:
            s = [p for p in c if acervo.slug_de[p] == gslug]
            if s:
                evid.append("slug")
                c = s
        if len(c) > 1:
            k = [p for p in c if classe_ok(classificacao, acervo.tags.get(p, set()))]
            if k:
                evid.append("classe")
                c = k
        return c

    if n is not None and acervo.por_numero.get(n):
        evid.append("num")
        return afunilar(list(acervo.por_numero[n])), evid, False
    if acervo.por_slug.get(gslug):
        evid.append("nome")
        return afunilar(list(acervo.por_slug[gslug])), evid, False

    proximos: list[str] = []
    if len(gslug) >= CONTINENCIA_MINIMA:
        proximos = [
            s for s in acervo.por_slug
            if len(s) >= CONTINENCIA_MINIMA
            and (s.startswith(gslug + "-") or gslug.startswith(s + "-"))
        ][:3]
    if not proximos:
        proximos = difflib.get_close_matches(
            gslug, list(acervo.por_slug), n=3, cutoff=SIMILARIDADE_MINIMA
        )
    if proximos:
        evid.append("nome~")
        return afunilar([p for s in proximos for p in acervo.por_slug[s]]), evid, True
    return [], evid, False


# --- o cruzamento de uma entrada ---------------------------------------------

@dataclass
class Resultado:
    faixa: str
    evidencias: list[str]
    praise_id: str | None = None
    material_id: str | None = None
    kind_coldigom: str | None = None
    nota: str | None = None
    candidatos: list[dict] = field(default_factory=list)


def _testemunhas(m: str, H: set[str], Pth: set[str]) -> list[str]:
    return [e for e, s in (("hash", H), ("path", Pth)) if m in s]


def _candidatos(
    P: list[str], evid_l: list[str], H: set[str], Pth: set[str], acervo: Acervo, fam: set[str]
) -> list[dict]:
    """Até MAX_CANDIDATOS (praise, material?) com o porquê de cada um.

    É o que o site mostra ao lado do PDF do PLPCG. Entram os praises da
    Camada L e os que só o hash apontou; por praise, cada material pdf que
    trouxe testemunha própria (hash, path, kind da família), e o praise
    sozinho quando nenhum material trouxe.
    """
    so_hash = sorted({acervo.praise_do_material[m] for m in H if m in acervo.praise_do_material} - set(P))
    out: list[dict] = []
    for p in list(P) + so_hash:
        base = list(evid_l) if p in P else []
        algum = False
        for (m, k, t) in acervo.materiais.get(p, []):
            if t != "pdf":
                continue
            por_que = base + _testemunhas(m, H, Pth) + (["kind"] if k in fam else [])
            if len(por_que) > len(base):
                out.append({"praise_id": p, "material_id": m, "kind": k,
                            "score": len(por_que), "por_que": por_que})
                algum = True
        if not algum and base:
            out.append({"praise_id": p, "material_id": None, "kind": None,
                        "score": len(base), "por_que": base})
    out.sort(key=lambda c: (-c["score"], c["praise_id"], c["material_id"] or ""))
    return out[:MAX_CANDIDATOS]


def cruzar(entrada: dict, acervo: Acervo, sha: str | None, hc: dict[str, set[str]]) -> Resultado:
    """As camadas do spec §5 para uma entrada do PLPCG.

    L escolhe o(s) louvor(es); H e P só contam DENTRO deles (a página da
    coletânea com 31–34 é o mesmo arquivo em quatro louvores — hash sozinho
    não decide). Um único material corroborado escolhe louvor e material.
    """
    fam = FAMILIA[entrada["categoria"]]
    gnum = entrada["group_id"].split(":", 1)[0]
    n = int(gnum) if gnum.isdigit() else None

    P, evid, aproximado = candidatos_louvor(
        entrada["group_id"], entrada["classificacao"], entrada["numero"], acervo
    )
    H: set[str] = set(hc.get(sha, ())) if sha else set()
    Pth: set[str] = set()
    for k in chaves_plpcg(entrada["caminho"], n):
        Pth |= acervo.chave_csv.get(k, set())

    corro = sorted({
        m for p in P for (m, _k, t) in acervo.materiais.get(p, [])
        if t == "pdf" and (m in H or m in Pth)
    })

    if len(corro) == 1:
        m = corro[0]
        p = acervo.praise_do_material[m]
        k = next(k for (mm, k, _t) in acervo.materiais[p] if mm == m)
        r = Resultado("media" if aproximado else "alta", evid + _testemunhas(m, H, Pth), p, m, k)
        if k not in fam:
            # O hash prova que é o mesmo arquivo; o kind errado é assunto da
            # Fase 2 do validate-acervo, não deste cruzamento.
            r.nota = f"kind divergente: coldigom={k}"
    elif len(corro) > 1:
        pr = {acervo.praise_do_material[m] for m in corro}
        r = Resultado("ambiguo", evid, nota=f"{len(corro)} materiais corroborados em {len(pr)} louvor(es)")
        if len(pr) == 1:
            r.praise_id = next(iter(pr))
    elif len(P) == 1:
        p = P[0]
        do_kind = [(m, k) for (m, k, t) in acervo.materiais.get(p, []) if t == "pdf" and k in fam]
        if len(do_kind) == 1:
            r = Resultado("media", evid + ["kind-unico"], p, do_kind[0][0], do_kind[0][1])
        elif not do_kind:
            fora = {acervo.praise_do_material[m] for m in H if m in acervo.praise_do_material} - {p}
            if fora and not aproximado:
                r = Resultado("media", evid + ["hash-fora"], p,
                              nota="arquivo idêntico em outro louvor: "
                              + ", ".join(sorted(acervo.praises[x]["name"] for x in fora)))
            else:
                r = Resultado("media" if aproximado else "faltante", evid, p,
                              nota="louvor casado, sem material desse kind")
        else:
            r = Resultado("ambiguo", evid, p, nota=f"{len(do_kind)} materiais do kind, nenhum corroborado")
    elif len(P) > 1:
        r = Resultado("ambiguo", evid, nota=f"{len(P)} louvores candidatos")
    else:
        so_hash = {acervo.praise_do_material[m] for m in H if m in acervo.praise_do_material}
        if len(so_hash) == 1:
            p = next(iter(so_hash))
            dele = [m for (m, _k, _t) in acervo.materiais[p] if m in H]
            r = Resultado("media", evid + ["hash-so"], p,
                          dele[0] if len(dele) == 1 else None,
                          nota="só hash: mesmo arquivo em " + acervo.praises[p]["name"])
            if r.material_id:
                r.kind_coldigom = next(k for (m, k, _t) in acervo.materiais[p] if m == r.material_id)
        elif so_hash:
            r = Resultado("ambiguo", evid + ["hash-so"], nota=f"hash bate em {len(so_hash)} louvores")
        else:
            r = Resultado("sem_louvor", evid, nota="nenhum louvor candidato")

    # aos candidatos vai só a evidência da Camada L; hash/path/kind cada
    # material traz a sua
    r.candidatos = _candidatos(P, [e for e in evid if e in EVIDENCIAS_L], H, Pth, acervo, fam)
    return r


# --- findings -----------------------------------------------------------------

def _finding(run_id: str, e: dict, sha: str | None, r: Resultado, checksum: str) -> Finding:
    confidence, acao = CONTRATO[r.faixa]
    return Finding(
        run_id=run_id,
        detector=DETECTOR,
        target_type="plpcg",
        target_id=e["pdf_id"],
        praise_id=r.praise_id,
        action=acao,
        confidence=confidence,
        proposed=r.material_id,
        evidence={
            "faixa": r.faixa,
            "evidencias": r.evidencias,
            "nome": e["nome"],
            "numero": e["numero"],
            "classificacao": e["classificacao"],
            "categoria": e["categoria"],
            "group_id": e["group_id"],
            "short_id": e["short_id"],
            "path": e["caminho"],
            "sha256": sha,
            "kind_esperado": KIND_ESPERADO[e["categoria"]],
            "kind_coldigom": r.kind_coldigom,
            "material_id": r.material_id,
            "nota": r.nota,
            "candidatos": r.candidatos,
            "checksum": checksum,
        },
    )


def _mais_parecido(gslug: str, acervo: Acervo) -> dict | None:
    """O nome mais próximo no coldigom, como aviso: 'se isto já existe, é
    provavelmente este'. cutoff=0 devolve sempre o melhor, por pior que seja."""
    if not acervo.por_slug:
        return None
    perto = difflib.get_close_matches(gslug, list(acervo.por_slug), n=1, cutoff=0.0)
    if not perto:
        return None
    pid = acervo.por_slug[perto[0]][0]
    score = difflib.SequenceMatcher(None, gslug, perto[0]).ratio()
    return {"praise_id": pid, "nome": acervo.praises[pid]["name"], "score": round(score, 2)}


def _finding_grupo(run_id: str, gid: str, itens: list[tuple[dict, Resultado, str | None]],
                   acervo: Acervo, checksum: str) -> Finding:
    """Um louvor que só existe no PLPCG (D4): praise + tags + um import por entrada."""
    gnum, gslug = gid.split(":", 1)
    nome = Counter(e["nome"] for e, _, _ in itens).most_common(1)[0][0]
    classificacao = itens[0][0]["classificacao"]
    # number só quando o grupo é numerado E é coletânea: um avulso com
    # número no PLPCG é número de pasta, não da coletânea (spec §7).
    numero = gnum if gnum.isdigit() and classe_base(classificacao).startswith("Coletânea") else ""
    return Finding(
        run_id=run_id,
        detector=DETECTOR,
        target_type="plpcg_grupo",
        target_id=gid,
        praise_id=None,
        action="create_praise_plpcg",
        confidence="alta",
        proposed=nome,
        evidence={
            "faixa": "sem_louvor",
            "nome": nome,
            "numero": numero,
            "classificacao": classificacao,
            "tags": tags_propostas(classificacao),
            "entradas": [
                {"pdf_id": e["pdf_id"], "short_id": e["short_id"], "categoria": e["categoria"],
                 "path": e["caminho"], "sha256": sha, "kind": KIND_ESPERADO[e["categoria"]]}
                for e, _, sha in itens
            ],
            "parecido": _mais_parecido(gslug, acervo),
            "checksum": checksum,
        },
    )


def detectar(
    snap: sqlite3.Connection,
    todas: list[dict],
    checksum: str,
    hp: dict[str, str],
    hc: dict[str, set[str]],
    run_id: str,
) -> tuple[list[Finding], Motivos]:
    acervo = Acervo.carregar(snap)
    findings: list[Finding] = []
    motivos = Motivos()
    por_grupo: dict[str, list[tuple[dict, Resultado, str | None]]] = defaultdict(list)

    for e in todas:
        if e["categoria"] not in KIND_ESPERADO:
            motivos.excluir(f"categoria fora do mapa: {e['categoria']}")
            continue
        if ":" not in (e.get("group_id") or ""):
            motivos.excluir("sem group_id — o PLPCG não diz qual louvor é")
            continue
        sha = hp.get(e["caminho"])
        r = cruzar(e, acervo, sha, hc)
        findings.append(_finding(run_id, e, sha, r, checksum))
        por_grupo[e["group_id"]].append((e, r, sha))

    # Um grupo inteiro sem louvor é um louvor novo. Grupo misto (uma entrada
    # achou o louvor pelo hash, outra não) NÃO é: vai para o site.
    for gid, itens in sorted(por_grupo.items()):
        if all(r.faixa == "sem_louvor" for _, r, _ in itens):
            findings.append(_finding_grupo(run_id, gid, itens, acervo, checksum))

    return findings, motivos


def resumo(findings: list[Finding]) -> str:
    """A tabela do spec §2.3 (categoria × faixa) e o resumo por louvor."""
    ents = [f for f in findings if f.target_type == "plpcg"]
    tab = Counter((f.evidence["categoria"], f.evidence["faixa"]) for f in ents)
    linhas = [
        "| categoria | " + " | ".join(FAIXAS_CROSSWALK) + " | total |",
        "|---|" + "---|" * (len(FAIXAS_CROSSWALK) + 1),
    ]
    for cat in CATEGORIAS:
        ns = [tab[(cat, fx)] for fx in FAIXAS_CROSSWALK]
        linhas.append(f"| {cat} | " + " | ".join(str(n) for n in ns) + f" | {sum(ns)} |")
    tot = [sum(tab[(c, fx)] for c in CATEGORIAS) for fx in FAIXAS_CROSSWALK]
    linhas.append("| **total** | " + " | ".join(str(n) for n in tot) + f" | {len(ents)} |")

    por_grupo: dict[str, list[str]] = defaultdict(list)
    for f in ents:
        por_grupo[f.evidence["group_id"]].append(f.evidence["faixa"])
    g: Counter = Counter()
    for fx in por_grupo.values():
        if all(x == "alta" for x in fx):
            g["todas alta"] += 1
        elif all(x == "sem_louvor" for x in fx):
            g["ausente no coldigom"] += 1
        elif "sem_louvor" in fx or "ambiguo" in fx:
            g["precisa de revisão"] += 1
        else:
            g["alta/média/faltante sem ambiguidade"] += 1
    linhas += ["", f"Louvores do PLPCG (grupos): {len(por_grupo)}"]
    for k in ("todas alta", "alta/média/faltante sem ambiguidade", "precisa de revisão", "ausente no coldigom"):
        linhas.append(f"- {k}: {g[k]}")

    ev = Counter("+".join(f.evidence["evidencias"]) for f in ents if f.evidence["faixa"] == "alta")
    linhas += ["", "Evidência na faixa alta:"]
    for k, n in ev.most_common():
        linhas.append(f"- {k}: {n}")
    return "\n".join(linhas)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=SNAPSHOT_DB, help="snapshot do coldigom")
    ap.add_argument("--plpcg", default=PLPCG_DB, help="exportação do PLPCG (python3 -m core.plpcg)")
    ap.add_argument("--hashes", default=HASHES_DB)
    ap.add_argument("--out", default=os.path.join(OUT, "plpcg_crosswalk"))
    args = ap.parse_args(argv)

    ensure_out()
    os.makedirs(args.out, exist_ok=True)
    run_id = time.strftime("%Y-%m-%dT%H%MZ-", time.gmtime()) + DETECTOR

    snap = conectar(args.db)
    plp = conectar_plpcg(args.plpcg)
    h = abrir_hashes(args.hashes)
    todas = entradas(plp)
    checksum = meta(plp).get("checksum", "")

    findings, motivos = detectar(snap, todas, checksum, hashes_de(h, LADO_PLPCG), hashes_coldigom(h), run_id)

    print(f"\n{DETECTOR} — {len(todas)} entradas do PLPCG (checksum {checksum[:12]})")
    print("exclusões:")
    print(motivos.tabela())
    texto = resumo(findings)
    print()
    print(texto)

    fj = os.path.join(args.out, "findings.jsonl")
    write_findings(findings, fj)
    with open(os.path.join(args.out, "resumo.md"), "w", encoding="utf-8") as f:
        f.write(f"# {DETECTOR} — {run_id}\n\nchecksum do catálogo PLPCG: `{checksum}`\n\n{texto}\n")
    print(f"\nfindings: {fj}")
    print(f"resumo:   {os.path.join(args.out, 'resumo.md')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
