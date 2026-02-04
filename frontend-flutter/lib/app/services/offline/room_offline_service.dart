import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/hive_config.dart';
import '../../models/room_offline_model.dart';
import 'dart:convert';

/// Provider do serviço de persistência de salas offline
final roomOfflineServiceProvider = Provider<RoomOfflineService>((ref) {
  return RoomOfflineService();
});

/// Serviço para gerenciar persistência de salas offline no Hive
class RoomOfflineService {
  static const String _keyPrefix = 'room_offline_';
  static const String _newRoomKey = 'room_offline_new';

  Box get _box => Hive.box(HiveConfig.offlineBoxName);

  /// Salva o estado de uma sala offline
  Future<void> saveRoomState(RoomOfflineState state) async {
    final key = state.roomId != null ? '$_keyPrefix${state.roomId}' : _newRoomKey;
    final json = jsonEncode(state.toJson());
    await _box.put(key, json);
  }

  /// Carrega o estado de uma sala offline
  RoomOfflineState? loadRoomState({String? roomId}) {
    final key = roomId != null ? '$_keyPrefix$roomId' : _newRoomKey;
    final json = _box.get(key);
    
    if (json == null) return null;
    
    try {
      final map = jsonDecode(json as String) as Map<String, dynamic>;
      return RoomOfflineState.fromJson(map);
    } catch (e) {
      return null;
    }
  }

  /// Carrega todas as salas offline salvas
  List<RoomOfflineState> loadAllRooms() {
    final rooms = <RoomOfflineState>[];
    
    for (var key in _box.keys) {
      if (key is String && key.startsWith(_keyPrefix)) {
        final state = loadRoomState(roomId: key.substring(_keyPrefix.length));
        if (state != null) {
          rooms.add(state);
        }
      }
    }
    
    // Também carregar sala nova se existir
    final newRoom = loadRoomState();
    if (newRoom != null) {
      rooms.add(newRoom);
    }
    
    return rooms;
  }

  /// Deleta o estado de uma sala offline
  Future<void> deleteRoomState({String? roomId}) async {
    final key = roomId != null ? '$_keyPrefix$roomId' : _newRoomKey;
    await _box.delete(key);
  }

  /// Limpa todas as salas offline (útil para logout)
  Future<void> clearAllRooms() async {
    final keysToDelete = <String>[];
    
    for (var key in _box.keys) {
      if (key is String && (key.startsWith(_keyPrefix) || key == _newRoomKey)) {
        keysToDelete.add(key);
      }
    }
    
    for (var key in keysToDelete) {
      await _box.delete(key);
    }
  }

  /// Verifica se existe uma sala offline
  bool hasRoomState({String? roomId}) {
    final key = roomId != null ? '$_keyPrefix$roomId' : _newRoomKey;
    return _box.containsKey(key);
  }
}
