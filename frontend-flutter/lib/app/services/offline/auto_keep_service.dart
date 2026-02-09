import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'offline_metadata_service.dart';
import 'download_service.dart';
import '../../models/praise_material_model.dart';

/// Provider do serviço de keep offline automático
final autoKeepServiceProvider = Provider<AutoKeepService>((ref) {
  final metadataService = ref.read(offlineMetadataServiceProvider);
  final downloadService = ref.read(offlineDownloadServiceProvider);
  return AutoKeepService(metadataService, downloadService);
});

/// Provider para habilitar/desabilitar keep offline automático
final autoKeepEnabledProvider = StateProvider<bool>((ref) => false);

/// Provider para lista de material kinds preferidos (IDs)
/// Nota: Requer implementação de UC-065 a UC-067 (Preferências do Usuário)
final preferredMaterialKindsProvider = StateProvider<List<String>>((ref) => []);

/// Serviço para manter offline automaticamente baseado em preferências (UC-141, UC-142)
class AutoKeepService {
  final OfflineMetadataService _metadataService;
  final OfflineDownloadService _downloadService;

  AutoKeepService(
    this._metadataService,
    this._downloadService,
  );

  /// Verifica se deve manter offline automaticamente baseado em preferências
  bool shouldKeepOffline(PraiseMaterialResponse material, WidgetRef ref) {
    final enabled = ref.read(autoKeepEnabledProvider);
    if (!enabled) return false;

    final preferredKinds = ref.read(preferredMaterialKindsProvider);
    if (preferredKinds.isEmpty) return false;

    return preferredKinds.contains(material.materialKindId);
  }

  /// Mantém offline automaticamente se atender aos critérios
  Future<void> autoKeepIfNeeded(
    PraiseMaterialResponse material,
    WidgetRef ref, {
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  }) async {
    if (!shouldKeepOffline(material, ref)) {
      return;
    }

    try {
      await _downloadService.keepMaterialOffline(
        material,
        onProgress: onProgress,
        onError: onError,
      );
    } catch (e) {
      onError?.call(e.toString());
    }
  }

  /// Atualiza metadados automaticamente para materiais mantidos offline (UC-142)
  /// Chamado pelo SyncService quando há atualizações disponíveis
  Future<void> updateKeptOfflineMaterials(
    List<PraiseMaterialResponse> updatedMaterials,
    WidgetRef ref,
  ) async {
    final keptOffline = _metadataService.getKeptOfflineMetadata();
    final keptOfflineIds = keptOffline.map((m) => m.materialId).toSet();

    for (final material in updatedMaterials) {
      if (keptOfflineIds.contains(material.id)) {
        // Material está mantido offline e foi atualizado
        // Atualizar automaticamente se habilitado
        final enabled = ref.read(autoKeepEnabledProvider);
        if (enabled) {
          try {
            await _downloadService.updateMaterialOffline(material);
          } catch (e) {
            // Log erro mas não falhar
            print('Erro ao atualizar material ${material.id} automaticamente: $e');
          }
        }
      }
    }
  }
}
