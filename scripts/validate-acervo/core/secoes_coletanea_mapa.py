# core/secoes_coletanea_mapa.py
"""O mapeamento de `praises.category` para subtags (spec 2026-09-24-secoes-
coletanea-subtags-design §2). Só constantes e uma função pura.

As strings são copiadas da spec byte a byte, inclusive a grafia errada
«Morte, Ressureição e Salvação» — é o valor que está no D1. Nenhuma
normalização (strip, casefold, NFC) é aplicada na comparação: valor que não
bate exatamente é "desconhecido" e a trava (a) aborta. Ninguém adivinha o
mapeamento (spec §7).
"""
from __future__ import annotations

RAIZ_COLETANEA = "Coletânea"
RAIZ_AVULSOS = "Avulsos"
SEP_ROTULO = " · "   # TAG_LABEL_SQL da API: `pai · filho`

# §2.1 — valor de `category` → nome da subtag de Coletânea.
SECAO_POR_CATEGORIA: dict[str, str] = {
    "Clamor": "Clamor",
    "Consolo e Encorajamento": "Consolo e Encorajamento",
    "Contra-Capa": "Contra-Capa",
    "Corinhos": "Corinhos",
    "Crianças e Adolescentes": "Crianças e Adolescentes",
    "Dedicação": "Dedicação",
    "Grupo de Louvor": "Grupo de Louvor",
    "Invocação e Comunhão": "Invocação e Comunhão",
    "Louvor": "Louvor",
    "Morte, Ressureição e Salvação": "Morte Ressurreição e Salvação",
    "Morte, Ressurreição e Salvação": "Morte Ressurreição e Salvação",
    "Salmos de Louvor": "Salmos de Louvor",
    "Santificação e Derramamento": "Santificação e Derramamento do Espírito Santo",
    "Santificação e Derramamento do Espírito Santo": "Santificação e Derramamento do Espírito Santo",
    "Volta de Jesus e Eternidade": "Volta de Jesus e Eternidade",
}

# §2.1, coluna «Praises depois» — o relatório compara, não aborta.
ESPERADO_DEPOIS: dict[str, int] = {
    "Clamor": 78,
    "Consolo e Encorajamento": 97,
    "Contra-Capa": 1,
    "Corinhos": 56,
    "Crianças e Adolescentes": 241,
    "Dedicação": 113,
    "Grupo de Louvor": 96,
    "Invocação e Comunhão": 39,
    "Louvor": 85,
    "Morte Ressurreição e Salvação": 96,
    "Salmos de Louvor": 20,
    "Santificação e Derramamento do Espírito Santo": 105,
    "Volta de Jesus e Eternidade": 96,
}
ESPERADO_TOTAL = 1123
ESPERADO_RAIZ_REMOVIDAS = 1119   # §5.1.6 — ligações diretas com Coletânea removidas
ESPERADO_AVULSOS_GLTM = 1        # §2.3 — só «Tu és Maravilhoso» (11e)

# §2.2 e §2.3 — valores de coleção: não geram tag e não mudam as tags.
CATEGORIAS_COLECAO: frozenset[str] = frozenset({
    "Avulso",
    "Avulsos",
    "Avulso Cias",
    "Avulsos das Senhoras",
})

# §2.1 — os 4 que têm seção e não têm a tag Coletânea (número, nome).
ENTRAM_NA_COLETANEA: tuple[tuple[str, str], ...] = (
    ("", "Alvo Mais Que a Neve"),
    ("060", "Tudo está pronto"),
    ("255", "Meu Coração Engrandece - ARR OPCIONAL"),
    ("609", "Senhor, Meu Deus, Quando Eu Maravilhado (Adaptação TEF 2024)"),
)

# §2.3 — casos manuais, por praise.id (aprovados pelo dono em 2026-09-24).
# `tags_hoje` são rótulos (`pai · filho` para subtag), como na tabela.
MANUAIS: tuple[dict, ...] = (
    {"id": "90ad7fd8-46d5-4121-a071-96b4fee42196", "short_id": "3b4", "numero": "046",
     "nome": "Ao Sentir o teu Perdão", "tags_hoje": frozenset({"Coletânea"}),
     "pai": RAIZ_COLETANEA, "subtag": "Clamor"},
    {"id": "b43a21e7-3c12-4a96-b298-e2bd908db2d9", "short_id": "488", "numero": "046",
     "nome": "Ao Sentir o teu Perdão", "tags_hoje": frozenset({"Coletânea", "PES"}),
     "pai": RAIZ_COLETANEA, "subtag": "Clamor"},
    {"id": "3c366df7-52c9-4d64-9ffb-03e6d4699e3e", "short_id": "186", "numero": "047",
     "nome": "Tenho no meu coração", "tags_hoje": frozenset({"CIAs", "Coletânea"}),
     "pai": RAIZ_COLETANEA, "subtag": "Crianças e Adolescentes"},
    {"id": "ffcb930d-b34d-4236-a389-3c7b0e198567", "short_id": "679", "numero": "99",
     "nome": "Um dia Jesus achou - me", "tags_hoje": frozenset({"Avulsos", "Coletânea"}),
     "pai": RAIZ_COLETANEA, "subtag": "Dedicação"},
    {"id": "1f468959-3e72-4000-bd54-1b9c682882db", "short_id": "806", "numero": "505",
     "nome": "Os seus cabelos brancos", "tags_hoje": frozenset({"Coletânea"}),
     "pai": RAIZ_COLETANEA, "subtag": "Volta de Jesus e Eternidade"},
    {"id": "70845455-7bb1-455a-990b-c6082b75261f", "short_id": "807", "numero": "506",
     "nome": "Tu Que Estás Assentado", "tags_hoje": frozenset({"Coletânea"}),
     "pai": RAIZ_COLETANEA, "subtag": "Volta de Jesus e Eternidade"},
    {"id": "bbd5f528-1622-4346-a3d7-898223f7292b", "short_id": "68b", "numero": "566",
     "nome": "O Senhor é meu Pastor (Maranata, Jesus vem)",
     "tags_hoje": frozenset({"Avulsos", "Coletânea", "Diversos · weider"}),
     "pai": RAIZ_COLETANEA, "subtag": "Volta de Jesus e Eternidade"},
    {"id": "2b309bf1-50a0-48fc-8607-8ccce0031500", "short_id": "11e", "numero": "",
     "nome": "Tu és Maravilhoso", "tags_hoje": frozenset({"GLTM"}),
     "pai": RAIZ_AVULSOS, "subtag": "GLTM"},
)

# As 14 subtags que o script garante: as 13 de §2.1 sob Coletânea e GLTM sob
# Avulsos (§5.1.3). Ordem estável = ordem do relatório.
SUBTAGS: tuple[tuple[str, str], ...] = tuple(
    (RAIZ_COLETANEA, nome) for nome in ESPERADO_DEPOIS
) + ((RAIZ_AVULSOS, "GLTM"),)


def classificar(category: str | None) -> tuple[str, str | None]:
    """('secao', subtag) | ('colecao', None) | ('vazio', None) | ('desconhecido', None).

    Vazio é NULL ou só espaço: é o que os 875 praises sem categoria têm. Todo o
    resto compara byte a byte com as tabelas acima.
    """
    if category is None or category.strip() == "":
        return "vazio", None
    if category in SECAO_POR_CATEGORIA:
        return "secao", SECAO_POR_CATEGORIA[category]
    if category in CATEGORIAS_COLECAO:
        return "colecao", None
    return "desconhecido", None
