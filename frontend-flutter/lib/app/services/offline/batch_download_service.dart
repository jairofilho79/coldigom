import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';
import '../api/api_service.dart';
import 'offline_metadata_service.dart';
import 'download_service.dart';
import '../../models/praise_material_model.dart';

/// Provider do serviço de download em lote
final batchDownloadServiceProvider = Provider<BatchDownloadService>((ref) {
  final apiService = ref.read(apiServiceProvider);
  final metadataService = ref.read(offlineMetadataServiceProvider);
  final downloadService = ref.read(offlineDownloadServiceProvider);
  return BatchDownloadService(apiService, metadataService, downloadService);
});

/// Serviço para download em lote de materiais por critérios (UC-127, UC-128)
class BatchDownloadService {
  final ApiService _apiService;
  final OfflineMetadataService _metadataService;
  final OfflineDownloadService _downloadService;

  BatchDownloadService(
    this._apiService,
    this._metadataService,
    this._downloadService,
  );

  /// Busca materiais que atendem aos critérios
  Future<List<PraiseMaterialResponse>> searchMaterials({
    List<String>? tagIds,
    List<String>? materialKindIds,
    String operation = 'union',
    bool? isOld,
  }) async {
    return await _apiService.batchSearchMaterials(
      tagIds: tagIds,
      materialKindIds: materialKindIds,
      operation: operation,
      isOld: isOld,
    );
  }

  /// Calcula tamanho total estimado dos materiais
  Future<int> estimateTotalSize(List<PraiseMaterialResponse> materials) async {
    // Por enquanto, retornamos uma estimativa baseada no número de materiais
    // Em produção, poderia buscar tamanhos reais do backend
    return materials.length * 1024 * 1024; // Estimativa: 1MB por material
  }

  /// Faz download em lote de materiais
  Future<Map<String, String>> downloadBatch(
    List<PraiseMaterialResponse> materials, {
    bool keepOffline = false, // true = keep offline, false = download externo
    Function(String materialId, double progress)? onProgress,
    Function(String materialId, String? error)? onError,
  }) async {
    final results = <String, String>{};
    final errors = <String, String>{};

    for (int i = 0; i < materials.length; i++) {
      final material = materials[i];
      
      try {
        if (keepOffline) {
          // Keep offline - usar método keepMaterialOffline
          await _downloadService.keepMaterialOffline(
            material,
            onProgress: (progress) {
              onProgress?.call(material.id, progress);
            },
            onError: (error) {
              onError?.call(material.id, error);
            },
          );
          results[material.id] = 'kept_offline';
        } else {
          // Download externo - usar método downloadMaterialToExternalPath
          final filePath = await _downloadService.downloadMaterialToExternalPath(
            material,
            onProgress: (progress) {
              onProgress?.call(material.id, progress);
            },
            onError: (error) {
              onError?.call(material.id, error);
            },
          );
          if (filePath != null) {
            results[material.id] = filePath;
          }
        }
      } catch (e) {
        final errorMsg = e.toString();
        errors[material.id] = errorMsg;
        onError?.call(material.id, errorMsg);
      }
    }

    if (errors.isNotEmpty && results.isEmpty) {
      throw Exception('Falha ao baixar todos os materiais: ${errors.values.join(", ")}');
    }

    return results;
  }

  /// Faz download em lote com controle de concorrência
  Future<Map<String, String>> downloadBatchConcurrent(
    List<PraiseMaterialResponse> materials, {
    bool keepOffline = false,
    int maxConcurrent = 5,
    Function(String materialId, double progress)? onProgress,
    Function(String materialId, String? error)? onError,
  }) async {
    final results = <String, String>{};
    final errors = <String, String>{};
    final semaphore = Completer<void>();
    int active = 0;

    Future<void> downloadMaterial(PraiseMaterialResponse material) async {
      // Aguardar slot disponível
      while (active >= maxConcurrent) {
        await Future.delayed(const Duration(milliseconds: 100));
      }
      active++;

      try {
        if (keepOffline) {
          await _downloadService.keepMaterialOffline(
            material,
            onProgress: (progress) {
              onProgress?.call(material.id, progress);
            },
            onError: (error) {
              onError?.call(material.id, error);
            },
          );
          results[material.id] = 'kept_offline';
        } else {
          final filePath = await _downloadService.downloadMaterialToExternalPath(
            material,
            onProgress: (progress) {
              onProgress?.call(material.id, progress);
            },
            onError: (error) {
              onError?.call(material.id, error);
            },
          );
          if (filePath != null) {
            results[material.id] = filePath;
          }
        }
      } catch (e) {
        final errorMsg = e.toString();
        errors[material.id] = errorMsg;
        onError?.call(material.id, errorMsg);
      } finally {
        active--;
      }
    }

    // Iniciar todos os downloads
    final futures = materials.map((material) => downloadMaterial(material));
    await Future.wait(futures);

    if (errors.isNotEmpty && results.isEmpty) {
      throw Exception('Falha ao baixar todos os materiais: ${errors.values.join(", ")}');
    }

    return results;
  }
}
