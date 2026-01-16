from typing import Optional, BinaryIO
from uuid import UUID
from pathlib import Path
import os
import shutil
from app.core.config import settings


class LocalStorageClient:
    """
    Cliente para armazenamento local de arquivos
    Armazena arquivos no sistema de arquivos local
    """
    
    def __init__(self):
        self.storage_path = Path(settings.STORAGE_LOCAL_PATH)
        # Criar diretório base se não existir
        self.storage_path.mkdir(parents=True, exist_ok=True)
    
    def upload_file(
        self,
        file_obj: BinaryIO,
        file_name: str,
        content_type: Optional[str] = None,
        folder: Optional[str] = None,
        material_id: Optional[UUID] = None
    ) -> str:
        """
        Faz upload de um arquivo para o armazenamento local
        
        Args:
            file_obj: Objeto de arquivo (BinaryIO)
            file_name: Nome original do arquivo
            content_type: Tipo MIME do arquivo (ignorado no armazenamento local)
            folder: Pasta onde o arquivo será salvo (opcional)
            material_id: ID do material para usar como nome do arquivo (opcional)
        
        Returns:
            Path do arquivo no storage relativo à raiz
        """
        # Use material_id as file name if provided, otherwise use original file name
        file_ext = os.path.splitext(file_name)[1]
        if material_id:
            file_name_to_use = f"{material_id}{file_ext}"
        else:
            file_name_to_use = file_name
        
        # Construir path completo
        if folder:
            file_path = self.storage_path / folder / file_name_to_use
            # Criar diretório se não existir
            file_path.parent.mkdir(parents=True, exist_ok=True)
            # Path relativo para retornar
            relative_path = f"{folder}/{file_name_to_use}"
        else:
            file_path = self.storage_path / file_name_to_use
            relative_path = file_name_to_use
        
        try:
            # Se o arquivo já existir, deleta primeiro (para garantir que seja substituído)
            if file_path.exists():
                file_path.unlink()
            
            # Salvar arquivo
            with open(file_path, 'wb') as f:
                shutil.copyfileobj(file_obj, f)
            
            return relative_path
        except Exception as e:
            raise Exception(f"Error uploading file to local storage: {str(e)}")
    
    def delete_file(self, file_path: str) -> bool:
        """
        Deleta um arquivo do armazenamento local
        
        Args:
            file_path: Path relativo do arquivo no storage
        
        Returns:
            True se deletado com sucesso
        """
        full_path = self.storage_path / file_path
        
        try:
            if full_path.exists():
                full_path.unlink()
                return True
            return False
        except Exception as e:
            raise Exception(f"Error deleting file from local storage: {str(e)}")
    
    def generate_url(self, file_path: str, expiration: int = 3600) -> str:
        """
        Gera uma URL relativa para acesso ao arquivo via Nginx
        
        Args:
            file_path: Path relativo do arquivo no storage (ou caminho completo que será normalizado)
            expiration: Tempo de expiração em segundos (ignorado para local)
        
        Returns:
            URL relativa que será servida pelo Nginx (ex: /assets/{file_path})
        """
        # Normalizar o path - remover caminho absoluto se presente
        # Se o path contém o storage_path completo, extrair apenas o relativo
        normalized_path = file_path
        
        # Se o path começa com o storage_path absoluto, remover
        storage_path_str = str(self.storage_path)
        if file_path.startswith(storage_path_str):
            # Extrair apenas a parte relativa
            normalized_path = file_path[len(storage_path_str):].lstrip('/')
        # Se o path começa com '/storage/assets', remover também
        elif file_path.startswith('/storage/assets/'):
            normalized_path = file_path[len('/storage/assets/'):]
        # Se o path começa com '/assets/', remover para evitar duplicação
        elif file_path.startswith('/assets/'):
            normalized_path = file_path[len('/assets/'):]
        
        # URL relativa que será servida pelo Nginx
        # Nginx vai servir de /assets/
        return f"/assets/{normalized_path}"
    
    def file_exists(self, file_path: str) -> bool:
        """
        Verifica se um arquivo existe no armazenamento local
        
        Args:
            file_path: Path relativo do arquivo no storage
        
        Returns:
            True se o arquivo existe
        """
        full_path = self.storage_path / file_path
        return full_path.exists() and full_path.is_file()
    
    def get_file_size(self, file_path: str) -> Optional[int]:
        """
        Obtém o tamanho de um arquivo no armazenamento local
        
        Args:
            file_path: Path relativo do arquivo no storage
        
        Returns:
            Tamanho do arquivo em bytes ou None se não existir
        """
        full_path = self.storage_path / file_path
        
        try:
            if full_path.exists() and full_path.is_file():
                return full_path.stat().st_size
            return None
        except Exception:
            return None
