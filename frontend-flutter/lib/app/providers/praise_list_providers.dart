import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/praise_list_model.dart';
import '../services/api/api_service.dart';

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

/// Provider para lista de praise lists com filtros
final praiseListsProvider = FutureProvider.family<List<PraiseListResponse>, PraiseListQueryParams>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getPraiseLists(
      name: params.name,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    );
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

/// Provider para detalhes de uma praise list
final praiseListByIdProvider = FutureProvider.family<PraiseListDetailResponse, String>(
  (ref, listId) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getPraiseListById(listId);
  },
);

/// Provider para criar uma nova praise list
final createPraiseListProvider = FutureProvider.family<PraiseListResponse, PraiseListCreate>(
  (ref, data) async {
    final apiService = ref.read(apiServiceProvider);
    final result = await apiService.createPraiseList(data);
    // Invalidar lista de listas após criar
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    return result;
  },
);

/// Provider para atualizar uma praise list
final updatePraiseListProvider = FutureProvider.family<PraiseListResponse, ({String id, PraiseListUpdate data})>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    final result = await apiService.updatePraiseList(params.id, params.data);
    // Invalidar lista e detalhes após atualizar
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    ref.invalidate(praiseListByIdProvider(params.id));
    return result;
  },
);

/// Provider para deletar uma praise list
final deletePraiseListProvider = FutureProvider.family<void, String>(
  (ref, listId) async {
    final apiService = ref.read(apiServiceProvider);
    await apiService.deletePraiseList(listId);
    // Invalidar lista após deletar
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
  },
);

/// Provider para adicionar praise à lista
final addPraiseToListProvider = FutureProvider.family<void, ({String listId, String praiseId})>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    await apiService.addPraiseToList(params.listId, params.praiseId);
    // Invalidar lista de listas e detalhes após adicionar para atualizar contagem
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    ref.invalidate(praiseListByIdProvider(params.listId));
  },
);

/// Provider para remover praise da lista
final removePraiseFromListProvider = FutureProvider.family<void, ({String listId, String praiseId})>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    await apiService.removePraiseFromList(params.listId, params.praiseId);
    // Invalidar lista de listas e detalhes após remover para atualizar contagem
    ref.invalidate(praiseListsProvider(PraiseListQueryParams()));
    ref.invalidate(praiseListByIdProvider(params.listId));
  },
);

/// Provider para reordenar praises na lista
final reorderPraisesInListProvider = FutureProvider.family<void, ({String listId, ReorderPraisesRequest data})>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    await apiService.reorderPraisesInList(params.listId, params.data);
    // Invalidar detalhes da lista após reordenar (contagem não muda, mas ordem sim)
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
