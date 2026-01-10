from typing import Protocol, Optional, BinaryIO
from uuid import UUID


class StorageClient(Protocol):
    """
    Protocol que define a interface comum para clientes de storage
    (Wasabi ou Local)
    """
    
    def upload_file(
        self,
        file_obj: BinaryIO,
        file_name: str,
        content_type: Optional[str] = None,
        folder: Optional[str] = None,
        material_id: Optional[UUID] = None
    ) -> str:
        """
        Faz upload de um arquivo para o storage
        
        Args:
            file_obj: Objeto de arquivo (BinaryIO)
            file_name: Nome original do arquivo
            content_type: Tipo MIME do arquivo
            folder: Pasta onde o arquivo será salvo (opcional)
            material_id: ID do material para usar como nome do arquivo (opcional)
        
        Returns:
            Path do arquivo no storage
        """
        ...
    
    def delete_file(self, file_path: str) -> bool:
        """
        Deleta um arquivo do storage
        
        Args:
            file_path: Path do arquivo no storage
        
        Returns:
            True se deletado com sucesso
        """
        ...
    
    def generate_url(self, file_path: str, expiration: int = 3600) -> str:
        """
        Gera uma URL para acesso ao arquivo
        
        Args:
            file_path: Path do arquivo no storage
            expiration: Tempo de expiração em segundos (padrão: 1 hora)
        
        Returns:
            URL para acesso ao arquivo (presigned URL para Wasabi, URL relativa para Local)
        """
        ...
    
    def file_exists(self, file_path: str) -> bool:
        """
        Verifica se um arquivo existe no storage
        
        Args:
            file_path: Path do arquivo no storage
        
        Returns:
            True se o arquivo existe
        """
        ...
    
    def get_file_size(self, file_path: str) -> Optional[int]:
        """
        Obtém o tamanho de um arquivo no storage
        
        Args:
            file_path: Path do arquivo no storage
        
        Returns:
            Tamanho do arquivo em bytes ou None se não existir
        """
        ...
