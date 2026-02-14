import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../../../core/config/hive_config.dart';
import '../../models/praise_list_model.dart';

/// Provider do serviço de cache de listas de praises
final praiseListCacheServiceProvider = Provider<PraiseListCacheService>((ref) {
  return PraiseListCacheService();
});

/// Serviço para gerenciar cache de listas da API no Hive (modo offline)
class PraiseListCacheService {
  static const String _listsKey = 'lists_all';
  static const String _listsLastSyncKey = 'lists_last_sync';

  Box get _box => Hive.box(HiveConfig.cacheBoxName);

  /// Salva lista de PraiseListDetailResponse no cache
  Future<void> saveAllLists(List<PraiseListDetailResponse> lists) async {
    final jsonList = lists.map((l) => l.toJson()).toList();
    await _box.put(_listsKey, jsonEncode(jsonList));
    await _box.put(_listsLastSyncKey, DateTime.now().toIso8601String());
  }

  /// Retorna todas as listas do cache
  List<PraiseListDetailResponse> getCachedLists() {
    final json = _box.get(_listsKey);
    if (json == null) return [];
    try {
      final list = jsonDecode(json as String) as List<dynamic>;
      return list
          .map((e) => PraiseListDetailResponse.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      return [];
    }
  }

  /// Retorna detalhe de uma lista por id
  PraiseListDetailResponse? getCachedListById(String id) {
    final lists = getCachedLists();
    try {
      return lists.firstWhere((l) => l.id == id);
    } catch (_) {
      return null;
    }
  }

  /// Retorna listas como PraiseListResponse (para listagem)
  List<PraiseListResponse> getCachedListsAsResponse() {
    return getCachedLists();
  }

  /// Retorna timestamp do último sync de listas
  DateTime? getLastSyncAt() {
    final json = _box.get(_listsLastSyncKey);
    if (json == null) return null;
    try {
      return DateTime.tryParse(json as String);
    } catch (e) {
      return null;
    }
  }

  /// Verifica se há listas em cache
  bool hasCachedLists() {
    return _box.containsKey(_listsKey) && getCachedLists().isNotEmpty;
  }
}
