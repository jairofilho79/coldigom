"""
Endpoint para geração de snapshots completos do backend (UC-143)

NOTA: Esta é uma implementação básica/stub. A implementação completa requer:
1. Geração de ZIP com todos os arquivos de materiais
2. Exportação de metadados (praises, tags, material kinds, etc.) em JSON
3. Criação de manifest.json com lista de arquivos e hashes SHA256
4. Assinatura digital do snapshot (chave pública/privada)
5. Estrutura de diretórios preservada

Estrutura do ZIP esperada:
snapshot_YYYYMMDD_HHMMSS.zip
├── manifest.json
├── signature.pem
├── metadata/
│   ├── praises.json
│   ├── tags.json
│   ├── material_kinds.json
│   └── ...
└── materials/
    ├── praise_1/
    │   ├── material_1.pdf
    │   └── material_2.mp3
    └── ...
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User

router = APIRouter()


@router.post("/generate")
def generate_snapshot(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Gera snapshot completo do backend (UC-143)
    
    TODO: Implementar:
    1. Buscar todos os praises, tags, material kinds, etc.
    2. Buscar todos os arquivos de materiais
    3. Criar estrutura de diretórios no ZIP
    4. Calcular hashes SHA256 de cada arquivo
    5. Criar manifest.json
    6. Assinar snapshot digitalmente
    7. Retornar arquivo ZIP para download
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Geração de snapshot ainda não implementada. Ver documentação em snapshots.py"
    )
