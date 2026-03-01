"""Schema for metadata manifest endpoint (id + version per resource for cache revalidation)."""
from pydantic import BaseModel
from typing import List


class MetadataManifestItem(BaseModel):
    """Single item in manifest: id and version (hash or updated_at iso)."""
    id: str
    version: str


class MetadataManifestResponse(BaseModel):
    """Lightweight manifest of all metadata for cache revalidation."""
    praises: List[MetadataManifestItem] = []
    praise_tags: List[MetadataManifestItem] = []
    material_kinds: List[MetadataManifestItem] = []
