from datetime import datetime
from typing import List
from pydantic import BaseModel


class ChangelogEntryResponse(BaseModel):
    version: int
    entity_type: str
    entity_id: str
    action: str
    created_at: datetime


class ChangelogResponse(BaseModel):
    current_version: int
    changes: List[ChangelogEntryResponse]


class ChangelogVersionResponse(BaseModel):
    current_version: int
