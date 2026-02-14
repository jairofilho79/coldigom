import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';
import '../api/api_service.dart';
import '../connectivity_service.dart';
import 'offline_metadata_service.dart';
import 'offline_list_service.dart';
import 'praise_list_cache_service.dart';
import '../../models/praise_list_model.dart';
import '../../providers/praise_list_providers.dart';

/// Provider do serviço de sincronização
final syncServiceProvider = Provider<SyncService>((ref) {
  final apiService = ref.read(apiServiceProvider);
  final metadataService = ref.read(offlineMetadataServiceProvider);
  final connectivityService = ref.read(connectivityServiceProvider);
  final offlineListService = ref.read(offlineListServiceProvider);
  final praiseListCacheService = ref.read(praiseListCacheServiceProvider);
  return SyncService(
    apiService,
    metadataService,
    connectivityService,
    offlineListService,
    praiseListCacheService,
  );
});

/// Provider para habilitar/desabilitar sincronização automática
final autoSyncEnabledProvider = StateProvider<bool>((ref) => true);

/// Provider para timestamp da última sincronização
final lastSyncTimestampProvider = StateProvider<DateTime?>((ref) => null);

/// Serviço para sincronização automática de metadados e listas offline quando online
class SyncService {
  final ApiService _apiService;
  final OfflineMetadataService _metadataService;
  final ConnectivityService _connectivityService;
  final OfflineListService _offlineListService;
  final PraiseListCacheService _praiseListCacheService;
  Timer? _syncTimer;

  SyncService(
    this._apiService,
    this._metadataService,
    this._connectivityService,
    this._offlineListService,
    this._praiseListCacheService,
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
      await syncPraiseListsToCache(ref);
      await syncPendingLists(ref);
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
          await _apiService.getPraiseById(praiseId);
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
          if (kDebugMode) debugPrint('Erro ao sincronizar praise $praiseId: $e');
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
          if (kDebugMode) debugPrint('Erro ao sincronizar material ${metadata.materialId}: $e');
        }
      }

      ref.read(lastSyncTimestampProvider.notifier).state = DateTime.now();
    } catch (e) {
      throw Exception('Erro ao sincronizar materiais mantidos offline: $e');
    }
  }

  /// Sincroniza listas da API para cache (disponíveis offline)
  Future<void> syncPraiseListsToCache(WidgetRef ref) async {
    try {
      final isOnline = await _connectivityService.isOnline();
      if (!isOnline) return;

      final lists = await _apiService.getPraiseLists();
      final details = <PraiseListDetailResponse>[];
      for (final list in lists) {
        try {
          final detail = await _apiService.getPraiseListById(list.id);
          details.add(detail);
        } catch (e) {
          if (kDebugMode) debugPrint('Erro ao buscar detalhe da lista ${list.id}: $e');
        }
      }
      if (details.isNotEmpty) {
        await _praiseListCacheService.saveAllLists(details);
      }
      ref.read(lastSyncTimestampProvider.notifier).state = DateTime.now();
    } catch (e) {
      if (kDebugMode) debugPrint('Erro ao sincronizar listas para cache: $e');
    }
  }

  /// Sincroniza listas offline pendentes com o backend
  Future<void> syncPendingLists(WidgetRef ref) async {
    try {
      final isOnline = await _connectivityService.isOnline();
      if (!isOnline) return;

      final pending = _offlineListService.loadPendingSyncLists();
      for (final offline in pending) {
        try {
          if (offline.id == null || offline.id!.startsWith('local_')) {
            // Nova lista: criar via API
            final create = PraiseListCreate(
              name: offline.name,
              description: offline.description,
              isPublic: false,
            );
            final created = await _apiService.createPraiseList(create);
            // Adicionar praises à lista criada
            for (final praiseId in offline.praiseIds) {
              try {
                await _apiService.addPraiseToList(created.id, praiseId);
              } catch (_) {}
            }
            if (offline.id != null && offline.id!.isNotEmpty) {
              await _offlineListService.deleteList(offline.id!);
            }
          } else {
            // Lista existente: atualizar via API
            final update = PraiseListUpdate(
              name: offline.name,
              description: offline.description,
            );
            await _apiService.updatePraiseList(offline.id!, update);
            // Sincronizar praises (add/remove) - simplificado: atualizar lista
            final current = await _apiService.getPraiseListById(offline.id!);
            final currentIds = current.praises.map((p) => p.id).toSet();
            for (final pid in offline.praiseIds) {
              if (!currentIds.contains(pid)) {
                try {
                  await _apiService.addPraiseToList(offline.id!, pid);
                } catch (_) {}
              }
            }
            for (final p in current.praises) {
              if (!offline.praiseIds.contains(p.id)) {
                try {
                  await _apiService.removePraiseFromList(offline.id!, p.id);
                } catch (_) {}
              }
            }
            await _offlineListService.markAsSynced(offline.id!);
          }
        } catch (e) {
          if (kDebugMode) debugPrint('Erro ao sincronizar lista ${offline.id}: $e');
        }
      }
      ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
      ref.read(lastSyncTimestampProvider.notifier).state = DateTime.now();
    } catch (e) {
      if (kDebugMode) debugPrint('Erro ao sincronizar listas pendentes: $e');
    }
  }

  /// Dispose
  void dispose() {
    stopPeriodicSync();
  }
}
