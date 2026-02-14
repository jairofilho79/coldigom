import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/praise_list_model.dart';
import '../models/praise_model.dart';
import '../models/offline_list_state.dart';
import '../services/api/api_service.dart';
import '../services/connectivity_service.dart';
import '../services/offline/offline_list_service.dart';
import '../services/offline/praise_cache_service.dart';
import '../services/offline/praise_list_cache_service.dart';

/// Classe wrapper para parâmetros de busca de praise lists
/// Implementa == e hashCode para evitar requisições duplicadas
class PraiseListQueryParams {
  final String? name;
  final String? dateFrom;
  final String? dateTo;

  PraiseListQueryParams({
    this.name,
    this.dateFrom,
    this.dateTo,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PraiseListQueryParams &&
          runtimeType == other.runtimeType &&
          name == other.name &&
          dateFrom == other.dateFrom &&
          dateTo == other.dateTo;

  @override
  int get hashCode => (name?.hashCode ?? 0) ^ (dateFrom?.hashCode ?? 0) ^ (dateTo?.hashCode ?? 0);
}

/// Classe wrapper para parâmetros de listas públicas
class PublicPraiseListQueryParams {
  final int skip;
  final int limit;

  PublicPraiseListQueryParams({
    required this.skip,
    required this.limit,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PublicPraiseListQueryParams &&
          runtimeType == other.runtimeType &&
          skip == other.skip &&
          limit == other.limit;

  @override
  int get hashCode => skip.hashCode ^ limit.hashCode;
}

/// Sincroniza listas da API para cache em background (disponíveis offline)
Future<void> _syncListsToCacheInBackground(
  ApiService apiService,
  PraiseListCacheService listCacheService,
) async {
  try {
    final lists = await apiService.getPraiseLists();
    final details = <PraiseListDetailResponse>[];
    for (final list in lists) {
      try {
        final detail = await apiService.getPraiseListById(list.id);
        details.add(detail);
      } catch (_) {}
    }
    if (details.isNotEmpty) {
      await listCacheService.saveAllLists(details);
    }
  } catch (_) {}
}

/// Converte OfflineListState para PraiseListResponse (para exibição)
PraiseListResponse _offlineListToResponse(OfflineListState offline) {
  return PraiseListResponse(
    id: offline.id ?? 'local_${offline.createdAt}',
    name: offline.name,
    description: offline.description,
    isPublic: false,
    userId: '',
    owner: offline.isPendingSync ? 'Offline (pendente sync)' : 'Offline',
    praisesCount: offline.praiseIds.length,
    createdAt: offline.createdAt,
    updatedAt: offline.updatedAt,
  );
}

/// Provider para lista de praise lists (híbrido: API + cache quando online; cache + offline quando offline)
final praiseListsProvider = FutureProvider.family<List<PraiseListResponse>, PraiseListQueryParams>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final offlineListService = ref.read(offlineListServiceProvider);
    final listCacheService = ref.read(praiseListCacheServiceProvider);

    final isOnline = await connectivityService.isOnline();
    final offlineLists = offlineListService.loadAllLists()
        .map(_offlineListToResponse)
        .toList();
    final cachedApiLists = listCacheService.getCachedListsAsResponse();

    if (isOnline) {
      final apiLists = await apiService.getPraiseLists(
        name: params.name,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      );
      // Sincronizar listas para cache em background (disponíveis offline)
      _syncListsToCacheInBackground(apiService, listCacheService);
      // Merge: listas da API + listas offline (excluir duplicatas por id)
      final apiIds = apiLists.map((l) => l.id).toSet();
      final onlyOffline = offlineLists.where((l) => !apiIds.contains(l.id)).toList();
      return [...apiLists, ...onlyOffline];
    }

    // Offline: listas do cache (API) + listas offline locais
    final allOfflineLists = [...cachedApiLists, ...offlineLists];
    // Aplicar filtro por nome se houver
    if (params.name != null && params.name!.isNotEmpty) {
      final lower = params.name!.toLowerCase();
      return allOfflineLists.where((l) => l.name.toLowerCase().contains(lower)).toList();
    }
    return allOfflineLists;
  },
);

/// Provider para listas públicas com paginação
final publicPraiseListsProvider = FutureProvider.family<List<PraiseListResponse>, PublicPraiseListQueryParams>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getPublicPraiseLists(
      skip: params.skip,
      limit: params.limit,
    );
  },
);

/// Converte OfflineListState para PraiseListDetailResponse (para exibição)
PraiseListDetailResponse _offlineListToDetail(
  OfflineListState offline,
  List<PraiseResponse> cachedPraises,
) {
  final praises = <PraiseInList>[];
  for (var i = 0; i < offline.praiseIds.length; i++) {
    final pid = offline.praiseIds[i];
    PraiseResponse? found;
    for (final p in cachedPraises) {
      if (p.id == pid) {
        found = p;
        break;
      }
    }
    praises.add(PraiseInList(
      id: pid,
      name: found?.name ?? pid,
      number: found?.number,
      order: i,
    ));
  }
  return PraiseListDetailResponse(
    id: offline.id ?? 'local_${offline.createdAt}',
    name: offline.name,
    description: offline.description,
    isPublic: false,
    userId: '',
    owner: offline.isPendingSync ? 'Offline (pendente sync)' : 'Offline',
    praisesCount: offline.praiseIds.length,
    createdAt: offline.createdAt,
    updatedAt: offline.updatedAt,
    praises: praises,
    isOwner: true,
    isFollowing: false,
  );
}

/// Provider para detalhes de uma praise list (híbrido: API quando online, cache/offline quando offline)
final praiseListByIdProvider = FutureProvider.family<PraiseListDetailResponse, String>(
  (ref, listId) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final offlineListService = ref.read(offlineListServiceProvider);
    final praiseCacheService = ref.read(praiseCacheServiceProvider);
    final listCacheService = ref.read(praiseListCacheServiceProvider);

    final isOnline = await connectivityService.isOnline();
    if (isOnline) {
      return await apiService.getPraiseListById(listId);
    }

    // Offline: buscar no cache de listas da API primeiro
    final cachedList = listCacheService.getCachedListById(listId);
    if (cachedList != null) {
      return cachedList;
    }

    // Offline: buscar em OfflineListService (listas criadas offline)
    final offlineList = offlineListService.loadList(listId);
    if (offlineList != null) {
      final cachedPraises = praiseCacheService.getCachedPraises();
      return _offlineListToDetail(offlineList, cachedPraises);
    }

    throw Exception('Lista não encontrada no cache offline');
  },
);

/// Provider para criar uma nova praise list (híbrido: API quando online, offline quando offline)
final createPraiseListProvider = FutureProvider.family<PraiseListResponse, PraiseListCreate>(
  (ref, data) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final offlineListService = ref.read(offlineListServiceProvider);

    final isOnline = await connectivityService.isOnline();
    if (isOnline) {
      final result = await apiService.createPraiseList(data);
      ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
      return result;
    }

    // Offline: salvar no Hive
    final now = DateTime.now().toIso8601String();
    final localId = 'local_${DateTime.now().millisecondsSinceEpoch}';
    final offline = OfflineListState(
      id: localId,
      name: data.name,
      description: data.description,
      praiseIds: [],
      createdAt: now,
      updatedAt: now,
      isPendingSync: true,
    );
    await offlineListService.saveList(offline);
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    return _offlineListToResponse(offline);
  },
);

/// Provider para atualizar uma praise list (híbrido)
final updatePraiseListProvider = FutureProvider.family<PraiseListResponse, ({String id, PraiseListUpdate data})>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final offlineListService = ref.read(offlineListServiceProvider);

    final offline = offlineListService.loadList(params.id);
    if (offline != null) {
      final isOnline = await connectivityService.isOnline();
      if (!isOnline) {
        final now = DateTime.now().toIso8601String();
        await offlineListService.saveList(offline.copyWith(
          name: params.data.name ?? offline.name,
          description: params.data.description ?? offline.description,
          updatedAt: now,
          isPendingSync: true,
        ));
        ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
        ref.invalidate(praiseListByIdProvider(params.id));
        return _offlineListToResponse(offlineListService.loadList(params.id)!);
      }
    }

    final result = await apiService.updatePraiseList(params.id, params.data);
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    ref.invalidate(praiseListByIdProvider(params.id));
    return result;
  },
);

/// Provider para deletar uma praise list (híbrido)
final deletePraiseListProvider = FutureProvider.family<void, String>(
  (ref, listId) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final offlineListService = ref.read(offlineListServiceProvider);

    final offline = offlineListService.loadList(listId);
    if (offline != null) {
      final isOnline = await connectivityService.isOnline();
      if (!isOnline) {
        await offlineListService.deleteList(listId);
        ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
        return;
      }
    }

    await apiService.deletePraiseList(listId);
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
  },
);

/// Provider para adicionar praise à lista (híbrido)
final addPraiseToListProvider = FutureProvider.family<void, ({String listId, String praiseId})>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final offlineListService = ref.read(offlineListServiceProvider);

    final offline = offlineListService.loadList(params.listId);
    if (offline != null) {
      final isOnline = await connectivityService.isOnline();
      if (!isOnline) {
        if (offline.praiseIds.contains(params.praiseId)) return;
        final updated = offline.copyWith(
          praiseIds: [...offline.praiseIds, params.praiseId],
          updatedAt: DateTime.now().toIso8601String(),
          isPendingSync: true,
        );
        await offlineListService.saveList(updated);
        ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
        ref.invalidate(praiseListByIdProvider(params.listId));
        return;
      }
    }

    await apiService.addPraiseToList(params.listId, params.praiseId);
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    ref.invalidate(praiseListByIdProvider(params.listId));
  },
);

/// Provider para remover praise da lista (híbrido)
final removePraiseFromListProvider = FutureProvider.family<void, ({String listId, String praiseId})>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final offlineListService = ref.read(offlineListServiceProvider);

    final offline = offlineListService.loadList(params.listId);
    if (offline != null) {
      final isOnline = await connectivityService.isOnline();
      if (!isOnline) {
        final updated = offline.copyWith(
          praiseIds: offline.praiseIds.where((id) => id != params.praiseId).toList(),
          updatedAt: DateTime.now().toIso8601String(),
          isPendingSync: true,
        );
        await offlineListService.saveList(updated);
        ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
        ref.invalidate(praiseListByIdProvider(params.listId));
        return;
      }
    }

    await apiService.removePraiseFromList(params.listId, params.praiseId);
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    ref.invalidate(praiseListByIdProvider(params.listId));
  },
);

/// Provider para reordenar praises na lista (híbrido)
final reorderPraisesInListProvider = FutureProvider.family<void, ({String listId, ReorderPraisesRequest data})>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final offlineListService = ref.read(offlineListServiceProvider);

    final offline = offlineListService.loadList(params.listId);
    if (offline != null) {
      final isOnline = await connectivityService.isOnline();
      if (!isOnline) {
        final orders = Map.fromEntries(
          params.data.praiseOrders.map((o) => MapEntry(o.praiseId, o.order)),
        );
        final sorted = [...offline.praiseIds]..sort((a, b) {
            final orderA = orders[a] ?? 0;
            final orderB = orders[b] ?? 0;
            return orderA.compareTo(orderB);
          });
        final updated = offline.copyWith(
          praiseIds: sorted,
          updatedAt: DateTime.now().toIso8601String(),
          isPendingSync: true,
        );
        await offlineListService.saveList(updated);
        ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
        ref.invalidate(praiseListByIdProvider(params.listId));
        return;
      }
    }

    await apiService.reorderPraisesInList(params.listId, params.data);
    ref.invalidate(praiseListByIdProvider(params.listId));
  },
);

/// Provider para seguir uma lista
final followListProvider = FutureProvider.family<void, String>(
  (ref, listId) async {
    final apiService = ref.read(apiServiceProvider);
    await apiService.followList(listId);
    // Invalidar lista e detalhes após seguir
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    ref.invalidate(praiseListByIdProvider(listId));
  },
);

/// Provider para deixar de seguir uma lista
final unfollowListProvider = FutureProvider.family<void, String>(
  (ref, listId) async {
    final apiService = ref.read(apiServiceProvider);
    await apiService.unfollowList(listId);
    // Invalidar lista e detalhes após deixar de seguir
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    ref.invalidate(praiseListByIdProvider(listId));
  },
);

/// Provider para copiar uma lista
final copyListProvider = FutureProvider.family<PraiseListResponse, String>(
  (ref, listId) async {
    final apiService = ref.read(apiServiceProvider);
    final result = await apiService.copyList(listId);
    // Invalidar lista após copiar
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    return result;
  },
);
