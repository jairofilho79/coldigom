import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';
import '../api/api_service.dart';
import '../connectivity_service.dart';
import 'offline_metadata_service.dart';
import '../../models/praise_model.dart';
import '../../models/praise_tag_model.dart';
import '../../models/material_kind_model.dart';
import '../../models/material_type_model.dart';
import '../../models/praise_material_model.dart';

/// Provider do serviço de sincronização
final syncServiceProvider = Provider<SyncService>((ref) {
  final apiService = ref.read(apiServiceProvider);
  final metadataService = ref.read(offlineMetadataServiceProvider);
  final connectivityService = ref.read(connectivityServiceProvider);
  return SyncService(apiService, metadataService, connectivityService);
});

/// Provider para habilitar/desabilitar sincronização automática
final autoSyncEnabledProvider = StateProvider<bool>((ref) => true);

/// Provider para timestamp da última sincronização
final lastSyncTimestampProvider = StateProvider<DateTime?>((ref) => null);

/// Serviço para sincronização automática de metadados quando online
class SyncService {
  final ApiService _apiService;
  final OfflineMetadataService _metadataService;
  final ConnectivityService _connectivityService;
  Timer? _syncTimer;

  SyncService(
    this._apiService,
    this._metadataService,
    this._connectivityService,
  );

  /// Inicia sincronização periódica (se habilitada)
  void startPeriodicSync(WidgetRef ref, {Duration interval = const Duration(hours: 24)}) {
    _syncTimer?.cancel();
    
    _syncTimer = Timer.periodic(interval, (_) async {
      final enabled = ref.read(autoSyncEnabledProvider);
      if (!enabled) return;

      final isOnline = await _connectivityService.isOnline();
      if (!isOnline) return;

      await syncMetadata(ref);
    });
  }

  /// Para sincronização periódica
  void stopPeriodicSync() {
    _syncTimer?.cancel();
    _syncTimer = null;
  }

  /// Sincroniza metadados quando online (UC-137)
  /// Busca atualizações de praises, tags, material kinds, material types e materiais
  Future<void> syncMetadata(WidgetRef ref) async {
    try {
      // Verificar se está online
      final isOnline = await _connectivityService.isOnline();
      if (!isOnline) {
        throw Exception('Sem conexão com a internet');
      }

      // Buscar atualizações incrementais
      // Por enquanto, vamos buscar apenas os dados que temos offline
      final allMetadata = _metadataService.getAllMetadata();
      final praiseIds = allMetadata.map((m) => m.praiseId).toSet().toList();

      // Sincronizar praises
      for (final praiseId in praiseIds) {
        try {
          final praise = await _apiService.getPraiseById(praiseId);
          // Atualizar metadados se necessário (ex: se material foi marcado como antigo)
          final materials = await _apiService.getMaterials(praiseId: praiseId);
          
          for (final material in materials) {
            final metadata = _metadataService.getMetadata(material.id);
            if (metadata != null) {
              // Atualizar informações de material antigo
              if (material.isOld != metadata.isOld ||
                  material.oldDescription != metadata.oldDescription) {
                await _metadataService.markAsOld(
                  material.id,
                  material.isOld ?? false,
                  material.oldDescription,
                );
              }
            }
          }
        } catch (e) {
          // Continuar mesmo se um praise falhar
          print('Erro ao sincronizar praise $praiseId: $e');
        }
      }

      // Atualizar timestamp da última sincronização
      ref.read(lastSyncTimestampProvider.notifier).state = DateTime.now();
    } catch (e) {
      throw Exception('Erro ao sincronizar metadados: $e');
    }
  }

  /// Sincroniza apenas materiais mantidos offline
  Future<void> syncKeptOfflineMaterials(WidgetRef ref) async {
    try {
      final isOnline = await _connectivityService.isOnline();
      if (!isOnline) {
        throw Exception('Sem conexão com a internet');
      }

      final keptOffline = _metadataService.getKeptOfflineMetadata();
      
      for (final metadata in keptOffline) {
        try {
          final material = await _apiService.getMaterialById(metadata.materialId);
          
          // Atualizar informações de material antigo
          if (material.isOld != metadata.isOld ||
              material.oldDescription != metadata.oldDescription) {
            await _metadataService.markAsOld(
              material.id,
              material.isOld ?? false,
              material.oldDescription,
            );
          }
        } catch (e) {
          // Continuar mesmo se um material falhar
          print('Erro ao sincronizar material ${metadata.materialId}: $e');
        }
      }

      ref.read(lastSyncTimestampProvider.notifier).state = DateTime.now();
    } catch (e) {
      throw Exception('Erro ao sincronizar materiais mantidos offline: $e');
    }
  }

  /// Dispose
  void dispose() {
    stopPeriodicSync();
  }
}
