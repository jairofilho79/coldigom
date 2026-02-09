import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';
import 'offline_metadata_service.dart';
import 'download_service.dart';
import '../../models/offline_material_metadata.dart';

/// Provider do gerenciador de cache
final cacheManagerProvider = Provider<CacheManager>((ref) {
  final metadataService = ref.read(offlineMetadataServiceProvider);
  final downloadService = ref.read(offlineDownloadServiceProvider);
  return CacheManager(metadataService, downloadService);
});

/// Provider para tamanho máximo de cache (em bytes)
final maxCacheSizeProvider = StateProvider<int?>((ref) {
  // Padrão: 1GB
  return 1024 * 1024 * 1024;
});

/// Provider para dias sem acesso antes de considerar para limpeza
final cacheCleanupDaysProvider = StateProvider<int>((ref) => 30);

/// Serviço para gerenciar cache de forma eficiente (UC-150)
class CacheManager {
  final OfflineMetadataService _metadataService;
  final OfflineDownloadService _downloadService;
  Timer? _cleanupTimer;

  CacheManager(this._metadataService, this._downloadService);

  /// Inicia limpeza automática periódica
  void startAutomaticCleanup(WidgetRef ref, {Duration interval = const Duration(days: 1)}) {
    _cleanupTimer?.cancel();
    
    _cleanupTimer = Timer.periodic(interval, (_) async {
      await cleanupOldCache(ref);
    });
  }

  /// Para limpeza automática
  void stopAutomaticCleanup() {
    _cleanupTimer?.cancel();
    _cleanupTimer = null;
  }

  /// Limpa cache antigo (materiais não acessados há muito tempo)
  Future<int> cleanupOldCache(WidgetRef ref) async {
    final daysOld = ref.read(cacheCleanupDaysProvider);
    final cutoffDate = DateTime.now().subtract(Duration(days: daysOld));
    
    final allMetadata = _metadataService.getAllMetadata();
    final toRemove = <OfflineMaterialMetadata>[];
    
    for (final metadata in allMetadata) {
      // Não remover materiais mantidos offline
      if (metadata.isKeptOffline) continue;
      
      // Verificar último acesso
      final lastAccess = metadata.lastAccessedAt ?? metadata.downloadedAt;
      if (lastAccess.isBefore(cutoffDate)) {
        toRemove.add(metadata);
      }
    }
    
    // Remover materiais antigos
    int removedCount = 0;
    for (final metadata in toRemove) {
      try {
        await _downloadService.removeOfflineMaterial(metadata.materialId);
        await _metadataService.deleteMetadata(metadata.materialId);
        removedCount++;
      } catch (e) {
        // Continuar mesmo se um falhar
        print('Erro ao remover material ${metadata.materialId}: $e');
      }
    }
    
    return removedCount;
  }

  /// Limpa cache quando está cheio (LRU - Least Recently Used)
  Future<int> cleanupWhenFull(WidgetRef ref) async {
    final maxSize = ref.read(maxCacheSizeProvider);
    if (maxSize == null) return 0; // Sem limite
    
    final currentSize = _metadataService.getTotalSize();
    if (currentSize <= maxSize) return 0; // Cache não está cheio
    
    // Ordenar por último acesso (mais antigo primeiro)
    final allMetadata = _metadataService.getAllMetadata();
    final sorted = allMetadata.where((m) => !m.isKeptOffline).toList()
      ..sort((a, b) {
        final aAccess = a.lastAccessedAt ?? a.downloadedAt;
        final bAccess = b.lastAccessedAt ?? b.downloadedAt;
        return aAccess.compareTo(bAccess);
      });
    
    // Remover até ficar abaixo do limite
    int removedCount = 0;
    int currentTotalSize = currentSize;
    
    for (final metadata in sorted) {
      if (currentTotalSize <= maxSize * 0.9) break; // Deixar 10% de margem
      
      try {
        await _downloadService.removeOfflineMaterial(metadata.materialId);
        await _metadataService.deleteMetadata(metadata.materialId);
        currentTotalSize -= metadata.fileSize;
        removedCount++;
      } catch (e) {
        print('Erro ao remover material ${metadata.materialId}: $e');
      }
    }
    
    return removedCount;
  }

  /// Verifica se cache está cheio e retorna porcentagem de uso
  double getCacheUsagePercentage(WidgetRef ref) {
    final maxSize = ref.read(maxCacheSizeProvider);
    if (maxSize == null) return 0.0;
    
    final currentSize = _metadataService.getTotalSize();
    return (currentSize / maxSize).clamp(0.0, 1.0);
  }

  /// Retorna se cache está cheio (>80%)
  bool isCacheFull(WidgetRef ref) {
    return getCacheUsagePercentage(ref) > 0.8;
  }

  /// Prioriza materiais mais acessados (atualiza lastAccessedAt)
  Future<void> prioritizeMaterial(String materialId) async {
    await _metadataService.updateLastAccessed(materialId);
  }

  /// Dispose
  void dispose() {
    stopAutomaticCleanup();
  }
}
