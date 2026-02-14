from app.core.config import settings
# Wasabi temporariamente desabilitado para fase beta
# from app.infrastructure.storage.wasabi_client import WasabiClient
from app.infrastructure.storage.local_storage_client import LocalStorageClient
from app.infrastructure.storage.storage_client import StorageClient


# Instância singleton dos clientes
# _wasabi_client: WasabiClient | None = None  # Desabilitado temporariamente
_local_client: LocalStorageClient | None = None


def get_storage_client() -> StorageClient:
    """
    Retorna o cliente de storage apropriado baseado na configuração STORAGE_MODE
    
    Durante a fase beta, apenas LocalStorageClient está disponível.
    Wasabi será reativado após a fase beta.
    
    Returns:
        StorageClient: Instância do cliente de storage (LocalStorageClient)
    
    Raises:
        Exception: Se STORAGE_MODE não for 'local'
    """
    global _local_client
    
    storage_mode = settings.STORAGE_MODE.lower()
    
    # Durante fase beta, apenas storage local é suportado
    if storage_mode != "local":
        raise Exception(
            f"STORAGE_MODE '{storage_mode}' não é suportado na fase beta. "
            "Use STORAGE_MODE=local. Wasabi será reativado após a fase beta."
        )
    
    if _local_client is None:
        _local_client = LocalStorageClient()
    return _local_client
    
    # Código do Wasabi comentado para uso futuro pós-beta
    # else:
    #     # Default: wasabi
    #     # Verificar se as credenciais estão configuradas
    #     if not settings.WASABI_ACCESS_KEY or not settings.WASABI_SECRET_KEY:
    #         raise Exception(
    #             "Wasabi credentials not configured. "
    #             "Set WASABI_ACCESS_KEY and WASABI_SECRET_KEY or use STORAGE_MODE=local"
    #         )
    #     if _wasabi_client is None:
    #         _wasabi_client = WasabiClient()
    #     return _wasabi_client
