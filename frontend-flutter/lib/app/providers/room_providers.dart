import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/room_model.dart';
import '../models/room_offline_model.dart';
import '../models/praise_model.dart';
import '../services/api/api_service.dart';
import '../services/offline/room_offline_service.dart';

/// Provider para o serviço de persistência offline
final roomOfflineServiceProvider = Provider<RoomOfflineService>((ref) {
  return RoomOfflineService();
});

/// StateNotifier para gerenciar estado da sala offline atual
class RoomOfflineStateNotifier extends StateNotifier<RoomOfflineState?> {
  final RoomOfflineService _offlineService;
  final String? _roomId;

  RoomOfflineStateNotifier(this._offlineService, this._roomId) : super(null) {
    _loadState();
  }

  Future<void> _loadState() async {
    final loadedState = _offlineService.loadRoomState(roomId: _roomId);
    state = loadedState;
  }

  Future<void> _saveState(RoomOfflineState state) async {
    await _offlineService.saveRoomState(state);
    this.state = state;
  }

  /// Cria uma nova sala offline vazia
  Future<void> createNewRoom() async {
    final newState = RoomOfflineState.empty();
    await _saveState(newState);
  }

  /// Adiciona um louvor à sala
  Future<void> addPraise(String praiseId) async {
    if (state == null) {
      await createNewRoom();
    }
    
    final currentState = state!;
    if (!currentState.praiseIds.contains(praiseId)) {
      final updatedState = currentState.copyWith(
        praiseIds: [...currentState.praiseIds, praiseId],
        updatedAt: DateTime.now().toIso8601String(),
      );
      await _saveState(updatedState);
    }
  }

  /// Remove um louvor da sala
  Future<void> removePraise(String praiseId) async {
    if (state == null) return;
    
    final currentState = state!;
    final updatedPraiseIds = currentState.praiseIds.where((id) => id != praiseId).toList();
    final updatedPlaylist = currentState.playlist.where((item) => item.praiseId != praiseId).toList();
    
    final updatedState = currentState.copyWith(
      praiseIds: updatedPraiseIds,
      playlist: updatedPlaylist,
      updatedAt: DateTime.now().toIso8601String(),
    );
    await _saveState(updatedState);
  }

  /// Adiciona um material à playlist
  Future<void> addMaterialToPlaylist({
    required String materialId,
    required String praiseId,
    required String praiseName,
    String? materialKindId,
    required String materialKindName,
    required String materialTypeName,
  }) async {
    if (state == null) {
      await createNewRoom();
    }
    
    final currentState = state!;
    final maxOrder = currentState.playlist.isEmpty 
        ? 0 
        : currentState.playlist.map((item) => item.order).reduce((a, b) => a > b ? a : b);
    
    final newItem = PlaylistItem(
      materialId: materialId,
      praiseId: praiseId,
      praiseName: praiseName,
      materialKindId: materialKindId,
      materialKindName: materialKindName,
      materialTypeName: materialTypeName,
      order: maxOrder + 1,
    );
    
    final updatedPlaylist = [...currentState.playlist, newItem];
    final updatedState = currentState.copyWith(
      playlist: updatedPlaylist,
      updatedAt: DateTime.now().toIso8601String(),
    );
    await _saveState(updatedState);
  }

  /// Remove um material da playlist
  Future<void> removeMaterialFromPlaylist(String materialId) async {
    if (state == null) return;
    
    final currentState = state!;
    final updatedPlaylist = currentState.playlist.where((item) => item.materialId != materialId).toList();
    
    // Reordenar
    final reorderedPlaylist = updatedPlaylist.asMap().entries.map((entry) {
      return entry.value.copyWith(order: entry.key + 1);
    }).toList();
    
    final updatedState = currentState.copyWith(
      playlist: reorderedPlaylist,
      updatedAt: DateTime.now().toIso8601String(),
    );
    await _saveState(updatedState);
  }

  /// Reordena a playlist
  Future<void> reorderPlaylist(List<PlaylistItem> newOrder) async {
    if (state == null) return;
    
    final reorderedPlaylist = newOrder.asMap().entries.map((entry) {
      return entry.value.copyWith(order: entry.key + 1);
    }).toList();
    
    final currentState = state!;
    final updatedState = currentState.copyWith(
      playlist: reorderedPlaylist,
      updatedAt: DateTime.now().toIso8601String(),
    );
    await _saveState(updatedState);
  }

  /// Atualiza o índice do material atual
  Future<void> setCurrentMaterialIndex(int? index) async {
    if (state == null) return;
    
    final currentState = state!;
    final updatedState = currentState.copyWith(
      currentMaterialIndex: index,
      updatedAt: DateTime.now().toIso8601String(),
    );
    await _saveState(updatedState);
  }

  /// Atualiza o roomId quando a sala é criada online
  Future<void> setRoomId(String roomId) async {
    if (state == null) return;
    
    final currentState = state!;
    final updatedState = currentState.copyWith(
      roomId: roomId,
      updatedAt: DateTime.now().toIso8601String(),
    );
    await _saveState(updatedState);
  }

  /// Limpa o estado da sala
  Future<void> clearRoom() async {
    if (_roomId != null) {
      await _offlineService.deleteRoomState(roomId: _roomId);
    } else {
      await _offlineService.deleteRoomState();
    }
    state = null;
  }
}

/// Provider para o StateNotifier da sala offline atual
final roomOfflineStateNotifierProvider = StateNotifierProvider.family<RoomOfflineStateNotifier, RoomOfflineState?, String?>((ref, roomId) {
  final offlineService = ref.read(roomOfflineServiceProvider);
  return RoomOfflineStateNotifier(offlineService, roomId);
});

/// Provider para o estado da sala offline atual (sem parâmetros, usa null para nova sala)
final currentRoomOfflineStateProvider = StateNotifierProvider<RoomOfflineStateNotifier, RoomOfflineState?>((ref) {
  final offlineService = ref.read(roomOfflineServiceProvider);
  return RoomOfflineStateNotifier(offlineService, null);
});

/// Provider para a playlist da sala offline atual
final roomPlaylistProvider = Provider<List<PlaylistItem>>((ref) {
  final state = ref.watch(currentRoomOfflineStateProvider);
  return state?.playlist ?? [];
});

/// Provider para os praises da sala offline atual
final roomPraisesProvider = Provider<List<String>>((ref) {
  final state = ref.watch(currentRoomOfflineStateProvider);
  return state?.praiseIds ?? [];
});

/// Provider para lista de salas do usuário
final roomsProvider = FutureProvider<List<RoomResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getRooms();
});

/// Provider para lista de salas públicas
final publicRoomsProvider = FutureProvider.family<List<RoomResponse>, ({int skip, int limit})>((ref, params) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getPublicRooms(skip: params.skip, limit: params.limit);
});

/// Provider para detalhes de uma sala
final roomByIdProvider = FutureProvider.family<RoomDetailResponse, String>((ref, roomId) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getRoomById(roomId);
});

/// Provider para buscar sala por código
final roomByCodeProvider = FutureProvider.family<RoomDetailResponse, String>((ref, code) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getRoomByCode(code);
});

/// Provider para criar uma sala
final createRoomProvider = FutureProvider.family<RoomResponse, RoomCreate>((ref, room) async {
  final apiService = ref.read(apiServiceProvider);
  final result = await apiService.createRoom(room);
  ref.invalidate(roomsProvider);
  return result;
});

/// Provider para atualizar uma sala
final updateRoomProvider = FutureProvider.family<RoomResponse, ({String id, RoomUpdate data})>((ref, params) async {
  final apiService = ref.read(apiServiceProvider);
  final result = await apiService.updateRoom(params.id, params.data);
  ref.invalidate(roomsProvider);
  ref.invalidate(roomByIdProvider(params.id));
  return result;
});

/// Provider para deletar uma sala
final deleteRoomProvider = FutureProvider.family<void, String>((ref, roomId) async {
  final apiService = ref.read(apiServiceProvider);
  await apiService.deleteRoom(roomId);
  ref.invalidate(roomsProvider);
});

/// Provider para adicionar praise à sala
final addPraiseToRoomProvider = FutureProvider.family<void, ({String roomId, String praiseId})>((ref, params) async {
  final apiService = ref.read(apiServiceProvider);
  await apiService.addPraiseToRoom(params.roomId, params.praiseId);
  ref.invalidate(roomByIdProvider(params.roomId));
});

/// Provider para remover praise da sala
final removePraiseFromRoomProvider = FutureProvider.family<void, ({String roomId, String praiseId})>((ref, params) async {
  final apiService = ref.read(apiServiceProvider);
  await apiService.removePraiseFromRoom(params.roomId, params.praiseId);
  ref.invalidate(roomByIdProvider(params.roomId));
});

/// Provider para reordenar praises na sala
final reorderPraisesInRoomProvider = FutureProvider.family<void, ({String roomId, RoomPraiseReorder reorder})>((ref, params) async {
  final apiService = ref.read(apiServiceProvider);
  await apiService.reorderPraisesInRoom(params.roomId, params.reorder);
  ref.invalidate(roomByIdProvider(params.roomId));
});

/// Provider para detalhes de uma sala (alias para roomByIdProvider)
final roomDetailProvider = roomByIdProvider;

/// Provider para participantes de uma sala
final roomParticipantsProvider = FutureProvider.family<List<Map<String, dynamic>>, String>((ref, roomId) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getRoomParticipants(roomId);
});

/// Provider para mensagens de uma sala
final roomMessagesProvider = FutureProvider.family<List<RoomMessageResponse>, String>((ref, roomId) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getRoomMessages(roomId);
});
