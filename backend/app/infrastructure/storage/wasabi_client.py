import boto3
from botocore.exceptions import ClientError
from typing import Optional, BinaryIO
from datetime import timedelta
from uuid import UUID
from app.core.config import settings
import uuid
import os


class WasabiClient:
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            endpoint_url=settings.WASABI_ENDPOINT,
            aws_access_key_id=settings.WASABI_ACCESS_KEY,
            aws_secret_access_key=settings.WASABI_SECRET_KEY,
            region_name=settings.WASABI_REGION
        )
        self.bucket_name = settings.WASABI_BUCKET

    def upload_file(
        self,
        file_obj: BinaryIO,
        file_name: str,
        content_type: Optional[str] = None,
        folder: Optional[str] = None,
        material_id: Optional[UUID] = None
    ) -> str:
        """
        Faz upload de um arquivo para o Wasabi
        
        Args:
            file_obj: Objeto de arquivo (BinaryIO)
            file_name: Nome original do arquivo
            content_type: Tipo MIME do arquivo
            folder: Pasta onde o arquivo será salvo (opcional)
            material_id: ID do material para usar como nome do arquivo (opcional)
        
        Returns:
            Path do arquivo no Wasabi
        """
        # Use material_id as file name if provided, otherwise generate UUID
        file_ext = os.path.splitext(file_name)[1]
        if material_id:
            file_name_to_use = f"{material_id}{file_ext}"
        else:
            file_name_to_use = f"{uuid.uuid4()}{file_ext}"
        
        if folder:
            key = f"{folder}/{file_name_to_use}"
        else:
            key = file_name_to_use
        
        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type
        
        try:
            self.s3_client.upload_fileobj(
                file_obj,
                self.bucket_name,
                key,
                ExtraArgs=extra_args
            )
            return key
        except ClientError as e:
            raise Exception(f"Error uploading file to Wasabi: {str(e)}")

    def delete_file(self, file_path: str) -> bool:
        """
        Deleta um arquivo do Wasabi
        
        Args:
            file_path: Path do arquivo no Wasabi
        
        Returns:
            True se deletado com sucesso
        """
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=file_path)
            return True
        except ClientError as e:
            raise Exception(f"Error deleting file from Wasabi: {str(e)}")

    def generate_presigned_url(
        self,
        file_path: str,
        expiration: int = 3600
    ) -> str:
        """
        Gera uma URL assinada para download temporário
        
        Args:
            file_path: Path do arquivo no Wasabi
            expiration: Tempo de expiração em segundos (padrão: 1 hora)
        
        Returns:
            URL assinada
        """
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': file_path},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            raise Exception(f"Error generating presigned URL: {str(e)}")
    
    def generate_url(self, file_path: str, expiration: int = 3600) -> str:
        """
        Alias para generate_presigned_url para compatibilidade com StorageClient protocol
        """
        return self.generate_presigned_url(file_path, expiration)

    def file_exists(self, file_path: str) -> bool:
        """
        Verifica se um arquivo existe no Wasabi
        
        Args:
            file_path: Path do arquivo no Wasabi
        
        Returns:
            True se o arquivo existe
        """
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=file_path)
            return True
        except ClientError:
            return False

    def get_file_size(self, file_path: str) -> Optional[int]:
        """
        Obtém o tamanho de um arquivo no Wasabi
        
        Args:
            file_path: Path do arquivo no Wasabi
        
        Returns:
            Tamanho do arquivo em bytes ou None se não existir
        """
        try:
            response = self.s3_client.head_object(Bucket=self.bucket_name, Key=file_path)
            return response.get('ContentLength')
        except ClientError:
            return None






