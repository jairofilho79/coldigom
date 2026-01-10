from app.core.config import settings
from app.infrastructure.storage.wasabi_client import WasabiClient
from app.infrastructure.storage.local_storage_client import LocalStorageClient
from app.infrastructure.storage.storage_client import StorageClient


# Instância singleton dos clientes
_wasabi_client: WasabiClient | None = None
_local_client: LocalStorageClient | None = None


def get_storage_client() -> StorageClient:
    """
    Retorna o cliente de storage apropriado baseado na configuração STORAGE_MODE
    
    Returns:
        StorageClient: Instância do cliente de storage (WasabiClient ou LocalStorageClient)
    
    Raises:
        Exception: Se o modo configurado for wasabi mas as credenciais não estiverem configuradas
    """
    global _wasabi_client, _local_client
    
    storage_mode = settings.STORAGE_MODE.lower()
    
    if storage_mode == "local":
        if _local_client is None:
            _local_client = LocalStorageClient()
        return _local_client
    else:
        # Default: wasabi
        # Verificar se as credenciais estão configuradas
        if not settings.WASABI_ACCESS_KEY or not settings.WASABI_SECRET_KEY:
            raise Exception(
                "Wasabi credentials not configured. "
                "Set WASABI_ACCESS_KEY and WASABI_SECRET_KEY or use STORAGE_MODE=local"
            )
        if _wasabi_client is None:
            _wasabi_client = WasabiClient()
        return _wasabi_client
