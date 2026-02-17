from app.domain.models.praise_tag import PraiseTag
from app.domain.models.material_kind import MaterialKind
from app.domain.models.material_type import MaterialType as MaterialTypeModel
from app.domain.models.praise_material import PraiseMaterial, MaterialType
from app.domain.models.praise import Praise
from app.domain.models.user import User
from app.domain.models.language import Language
from app.domain.models.material_kind_translation import MaterialKindTranslation
from app.domain.models.praise_tag_translation import PraiseTagTranslation
from app.domain.models.material_type_translation import MaterialTypeTranslation
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.domain.models.consent import UserConsent

__all__ = [
    "PraiseTag",
    "MaterialKind",
    "MaterialTypeModel",
    "PraiseMaterial",
    "MaterialType",  # Enum temporário para compatibilidade
    "Praise",
    "User",
    "Language",
    "MaterialKindTranslation",
    "PraiseTagTranslation",
    "MaterialTypeTranslation",
    "AuditLog",
    "AuditActionType",
    "UserConsent",
]






