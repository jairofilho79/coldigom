from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from uuid import UUID
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.application.services.data_protection_service import DataProtectionService
import json

router = APIRouter()


@router.post("/export")
def export_user_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Exporta todos os dados do usuário autenticado (Right to Data Portability - LGPD/GDPR).
    
    Retorna um arquivo JSON com todos os dados do usuário.
    """
    service = DataProtectionService(db)
    user_data = service.export_user_data(current_user.id)
    
    # Retornar como JSON
    return Response(
        content=json.dumps(user_data, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="user_data_{current_user.id}.json"'
        }
    )


@router.post("/anonymize")
def anonymize_user_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Anonimiza dados do usuário autenticado (Right to be Forgotten - LGPD/GDPR).
    
    ATENÇÃO: Esta operação é irreversível. Os dados pessoais serão substituídos
    por valores anonimizados e a conta será desativada.
    """
    service = DataProtectionService(db)
    result = service.anonymize_user_data(current_user.id)
    
    return {
        "message": "User data anonymized successfully",
        "details": result
    }
