from __future__ import annotations

import subprocess

import pytest

from core import d1


def test_r2_put_e_delete_chamam_wrangler_r2_object(monkeypatch, tmp_path):
    chamadas = []

    def falso_run(args, **kw):
        chamadas.append((args, kw.get("cwd"), kw.get("check")))
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(d1.subprocess, "run", falso_run)
    pdf = tmp_path / "x.pdf"
    pdf.write_bytes(b"%PDF")
    d1.r2_put("storage/assets/praises/p/m.pdf", str(pdf))
    d1.r2_delete("storage/assets/praises/p/m.pdf")
    assert chamadas[0][0] == ["wrangler", "r2", "object", "put", "coldigom-assets/storage/assets/praises/p/m.pdf",
                              "--file", str(pdf), "--content-type", "application/pdf", "--remote"]
    assert chamadas[1][0] == ["wrangler", "r2", "object", "delete", "coldigom-assets/storage/assets/praises/p/m.pdf", "--remote"]
    assert all(c[1] == d1.API_DIR and c[2] is True for c in chamadas)


def test_r2_put_recusa_arquivo_inexistente(monkeypatch, tmp_path):
    monkeypatch.setattr(d1.subprocess, "run", lambda *a, **k: pytest.fail("não devia chamar wrangler"))
    with pytest.raises(FileNotFoundError):
        d1.r2_put("storage/x.pdf", str(tmp_path / "nao-existe.pdf"))


def test_r2_put_e_delete_local_emitem_flag_local_em_vez_de_remote(monkeypatch, tmp_path):
    # A1: --local nunca chegava ao R2 (r2_put/r2_delete tinham --remote fixo).
    chamadas = []

    def falso_run(args, **kw):
        chamadas.append(args)
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(d1.subprocess, "run", falso_run)
    pdf = tmp_path / "x.pdf"
    pdf.write_bytes(b"%PDF")
    d1.r2_put("storage/x.pdf", str(pdf), remote=False)
    d1.r2_delete("storage/x.pdf", remote=False)
    assert chamadas[0] == ["wrangler", "r2", "object", "put", "coldigom-assets/storage/x.pdf",
                           "--file", str(pdf), "--content-type", "application/pdf", "--local"]
    assert chamadas[1] == ["wrangler", "r2", "object", "delete", "coldigom-assets/storage/x.pdf", "--local"]
