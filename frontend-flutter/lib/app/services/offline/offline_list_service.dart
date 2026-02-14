import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../../../core/config/hive_config.dart';
import '../../models/offline_list_state.dart';

/// Provider do serviço de listas offline
final offlineListServiceProvider = Provider<OfflineListService>((ref) {
  return OfflineListService();
});

/// Serviço para gerenciar listas offline no Hive
class OfflineListService {
  static const String _keyPrefix = 'list_offline_';
  static const String _listIdsKey = 'list_offline_ids';

  Box get _box => Hive.box(HiveConfig.offlineBoxName);

  List<String> _getStoredListIds() {
    final json = _box.get(_listIdsKey);
    if (json == null) return [];
    try {
      final list = jsonDecode(json as String) as List<dynamic>;
      return list.map((e) => e.toString()).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _saveListIds(List<String> ids) async {
    await _box.put(_listIdsKey, jsonEncode(ids));
  }

  String _listKey(String id) => '$_keyPrefix$id';

  /// Salva ou atualiza uma lista offline
  Future<void> saveList(OfflineListState state) async {
    final id = state.id ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    final stateToSave = state.id == null ? state.copyWith(id: id) : state;
    final key = _listKey(id);
    await _box.put(key, jsonEncode(stateToSave.toJson()));

    final ids = _getStoredListIds();
    if (!ids.contains(id)) {
      ids.add(id);
      await _saveListIds(ids);
    }
  }

  /// Carrega uma lista por ID
  OfflineListState? loadList(String id) {
    final key = _listKey(id);
    final json = _box.get(key);
    if (json == null) return null;
    try {
      final map = jsonDecode(json as String) as Map<String, dynamic>;
      return OfflineListState.fromJson(map);
    } catch (_) {
      return null;
    }
  }

  /// Carrega todas as listas offline (incluindo pendentes de sync)
  List<OfflineListState> loadAllLists() {
    final ids = _getStoredListIds();
    final lists = <OfflineListState>[];
    for (final id in ids) {
      final list = loadList(id);
      if (list != null) {
        lists.add(list.copyWith(id: id == list.id ? list.id : id));
      }
    }
    return lists;
  }

  /// Carrega listas pendentes de sincronização
  List<OfflineListState> loadPendingSyncLists() {
    return loadAllLists().where((l) => l.isPendingSync).toList();
  }

  /// Remove uma lista offline
  Future<void> deleteList(String id) async {
    final key = _listKey(id);
    await _box.delete(key);
    final ids = _getStoredListIds();
    ids.remove(id);
    await _saveListIds(ids);
  }

  /// Atualiza o ID de uma lista após sync (quando criada via API)
  Future<void> updateListId(String oldId, String newId) async {
    final list = loadList(oldId);
    if (list == null) return;

    await _box.delete(_listKey(oldId));
    final ids = _getStoredListIds();
    ids.remove(oldId);
    ids.add(newId);
    await _saveListIds(ids);

    await saveList(list.copyWith(id: newId, isPendingSync: false));
  }

  /// Marca lista como sincronizada
  Future<void> markAsSynced(String id) async {
    final list = loadList(id);
    if (list != null) {
      await saveList(list.copyWith(isPendingSync: false));
    }
  }

  /// Limpa todas as listas offline (útil para logout)
  Future<void> clearAllLists() async {
    for (final id in _getStoredListIds()) {
      await _box.delete(_listKey(id));
    }
    await _box.delete(_listIdsKey);
  }
}
