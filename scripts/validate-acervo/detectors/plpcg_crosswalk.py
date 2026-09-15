from __future__ import annotations

import difflib
import re
import sqlite3
import unicodedata
from collections import defaultdict
from dataclasses import dataclass

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
    n = int(gnum) if gnum.isdigit() else numero_int(numero)
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
