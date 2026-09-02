from __future__ import annotations

import hashlib
import json
import os
from collections import Counter
from dataclasses import asdict, dataclass, field as dc_field

FAIXAS = ("alta", "media", "baixa", "discussao")

ACOES = (
    "delete_material",
    "set_material_kind",
    "set_praise_field",
    "merge_praise",
    "set_group_id",
    "move_material",
)


def finding_id(detector: str, target_id: str, field: str | None) -> str:
    """Id determinístico: rodar o mesmo detector de novo não duplica finding."""
    chave = f"{detector}|{target_id}|{field or ''}"
    return hashlib.sha1(chave.encode("utf-8")).hexdigest()[:16]


@dataclass
class Finding:
    run_id: str
    detector: str
    target_type: str          # material | praise
    target_id: str
    action: str
    confidence: str
    evidence: dict
    praise_id: str | None = None
    field: str | None = None
    current: str | None = None
    proposed: str | None = None
    finding_id: str = dc_field(default="")

    def __post_init__(self) -> None:
        if self.confidence not in FAIXAS:
            raise ValueError(f"faixa desconhecida: {self.confidence}")
        if self.action not in ACOES:
            raise ValueError(f"ação desconhecida: {self.action}")
        if not self.finding_id:
            self.finding_id = finding_id(self.detector, self.target_id, self.field)


def write_findings(findings: list[Finding], caminho: str) -> None:
    os.makedirs(os.path.dirname(caminho) or ".", exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        for x in findings:
            f.write(json.dumps(asdict(x), ensure_ascii=False) + "\n")


def read_findings(caminho: str) -> list[Finding]:
    out: list[Finding] = []
    if not os.path.exists(caminho):
        return out
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            out.append(Finding(**json.loads(linha)))
    return out


class Motivos:
    """Contador de exclusões, com a frase-motivo em português.

    Existe para que toda execução comece dizendo quem ficou de fora e por quê.
    Sem isso, um detector que exclui 90% do lote parece um detector que não
    achou nada.
    """

    def __init__(self) -> None:
        self._c: Counter = Counter()

    def excluir(self, motivo: str) -> None:
        self._c[motivo] += 1

    def total(self) -> int:
        return sum(self._c.values())

    def tabela(self) -> str:
        if not self._c:
            return "  (nenhuma exclusão)"
        largura = max(len(k) for k in self._c)
        return "\n".join(
            f"  {k.ljust(largura)}  {v}" for k, v in self._c.most_common()
        )
