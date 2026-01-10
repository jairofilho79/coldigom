#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para sincronizar assets do Wasabi para armazenamento local
Este script:
1. Lista todos os objetos do bucket Wasabi
2. Baixa cada arquivo mantendo a estrutura de pastas
3. Salva no diretório local configurado em STORAGE_LOCAL_PATH
Útil para preparar assets para uso offline ou copiar via pendrive
"""

import sys
import os
from pathlib import Path
from typing import Optional
import boto3
from botocore.exceptions import ClientError

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


class WasabiSyncClient:
    """Cliente para sincronizar arquivos do Wasabi para armazenamento local"""
    
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            endpoint_url=settings.WASABI_ENDPOINT,
            aws_access_key_id=settings.WASABI_ACCESS_KEY,
            aws_secret_access_key=settings.WASABI_SECRET_KEY,
            region_name=settings.WASABI_REGION
        )
        self.bucket_name = settings.WASABI_BUCKET
        self.local_path = Path(settings.STORAGE_LOCAL_PATH)
        self.local_path.mkdir(parents=True, exist_ok=True)
    
    def list_all_objects(self, prefix: Optional[str] = None) -> list:
        """
        Lista todos os objetos do bucket Wasabi
        
        Args:
            prefix: Prefixo para filtrar objetos (opcional)
        
        Returns:
            Lista de objetos do bucket
        """
        objects = []
        paginator = self.s3_client.get_paginator('list_objects_v2')
        
        try:
            if prefix:
                pages = paginator.paginate(Bucket=self.bucket_name, Prefix=prefix)
            else:
                pages = paginator.paginate(Bucket=self.bucket_name)
            
            for page in pages:
                if 'Contents' in page:
                    objects.extend(page['Contents'])
            
            return objects
        except ClientError as e:
            print(f"❌ Erro ao listar objetos: {e}")
            return []
    
    def download_file(self, key: str, local_path: Path) -> bool:
        """
        Baixa um arquivo do Wasabi para o armazenamento local
        
        Args:
            key: Chave do objeto no Wasabi
            local_path: Caminho local onde salvar o arquivo
        
        Returns:
            True se baixado com sucesso
        """
        try:
            # Criar diretório pai se não existir
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Baixar arquivo
            self.s3_client.download_file(
                self.bucket_name,
                key,
                str(local_path)
            )
            return True
        except ClientError as e:
            print(f"    ❌ Erro ao baixar {key}: {e}")
            return False
    
    def sync_all(self, prefix: Optional[str] = None, dry_run: bool = False) -> dict:
        """
        Sincroniza todos os arquivos do Wasabi para armazenamento local
        
        Args:
            prefix: Prefixo para filtrar objetos (opcional, ex: "praises/")
            dry_run: Se True, apenas simula sem baixar arquivos
        
        Returns:
            Dicionário com estatísticas da sincronização
        """
        print(f"🔄 Iniciando sincronização do Wasabi para local...")
        print(f"   Bucket: {self.bucket_name}")
        print(f"   Prefixo: {prefix if prefix else '(todos)'}")
        print(f"   Destino: {self.local_path}")
        if dry_run:
            print(f"   ⚠️  MODO DRY RUN - Nenhum arquivo será baixado")
        print()
        
        # Listar todos os objetos
        objects = self.list_all_objects(prefix=prefix)
        
        if not objects:
            print("⚠️  Nenhum objeto encontrado no Wasabi")
            return {"total": 0, "downloaded": 0, "skipped": 0, "errors": 0}
        
        print(f"📊 Total de objetos encontrados: {len(objects)}")
        print()
        
        stats = {
            "total": len(objects),
            "downloaded": 0,
            "skipped": 0,
            "errors": 0
        }
        
        # Processar cada objeto
        for i, obj in enumerate(objects, 1):
            key = obj['Key']
            size = obj.get('Size', 0)
            size_mb = size / (1024 * 1024)
            
            # Ignorar diretórios (chaves terminadas com /)
            if key.endswith('/'):
                stats["skipped"] += 1
                continue
            
            # Construir caminho local
            local_file_path = self.local_path / key
            
            # Verificar se arquivo já existe e tem mesmo tamanho
            if local_file_path.exists():
                if local_file_path.stat().st_size == size:
                    stats["skipped"] += 1
                    if i % 100 == 0 or i == len(objects):
                        print(f"[{i}/{len(objects)}] ⏭️  Já existe: {key} ({size_mb:.2f} MB)")
                    continue
            
            if dry_run:
                print(f"[{i}/{len(objects)}] [DRY RUN] Baixaria: {key} ({size_mb:.2f} MB)")
                stats["downloaded"] += 1
            else:
                # Baixar arquivo
                print(f"[{i}/{len(objects)}] ⬇️  Baixando: {key} ({size_mb:.2f} MB)")
                if self.download_file(key, local_file_path):
                    stats["downloaded"] += 1
                else:
                    stats["errors"] += 1
                
                # Progresso a cada 10 arquivos
                if i % 10 == 0:
                    print(f"  💾 Progresso: {i}/{len(objects)} arquivos processados")
        
        return stats


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Sincroniza assets do Wasabi para armazenamento local'
    )
    parser.add_argument(
        '--prefix',
        type=str,
        help='Prefixo para filtrar objetos (ex: "praises/")'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Modo de simulação (não baixa arquivos)'
    )
    
    args = parser.parse_args()
    
    # Verificar se estamos usando Wasabi
    if settings.STORAGE_MODE.lower() != "wasabi":
        print("⚠️  AVISO: STORAGE_MODE não está configurado como 'wasabi'")
        print(f"   Valor atual: {settings.STORAGE_MODE}")
        print("   Este script requer configuração do Wasabi")
        return 1
    
    # Verificar credenciais do Wasabi
    if not settings.WASABI_ACCESS_KEY or not settings.WASABI_SECRET_KEY:
        print("❌ Erro: Credenciais do Wasabi não configuradas")
        print("   Configure WASABI_ACCESS_KEY e WASABI_SECRET_KEY no .env")
        return 1
    
    try:
        sync_client = WasabiSyncClient()
        stats = sync_client.sync_all(prefix=args.prefix, dry_run=args.dry_run)
        
        print()
        print("=" * 60)
        print("📊 Estatísticas da Sincronização:")
        print(f"   Total de objetos: {stats['total']}")
        print(f"   Baixados: {stats['downloaded']}")
        print(f"   Já existentes (ignorados): {stats['skipped']}")
        print(f"   Erros: {stats['errors']}")
        print("=" * 60)
        
        if stats['errors'] > 0:
            return 1
        
        return 0
        
    except Exception as e:
        print(f"\n❌ Erro fatal: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
