import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/room_model.dart';
import '../models/room_offline_model.dart';
import '../services/api/api_service.dart';
import '../providers/room_providers.dart';

/// Provider do serviço de sincronização de salas
final roomSyncServiceProvider = Provider<RoomSyncService>((ref) {
  final apiService = ref.read(apiServiceProvider);
  return RoomSyncService(apiService);
});

/// Serviço para sincronizar sala offline com backend e tornar online
class RoomSyncService {
  final ApiService _apiService;

  RoomSyncService(this._apiService);

  /// Sincroniza a sala offline com o backend
  /// Cria a sala se não existir, adiciona os praises e retorna o RoomResponse
  Future<RoomResponse> syncRoomToOnline(RoomOfflineState offlineState) async {
    RoomResponse room;

    if (offlineState.roomId != null) {
      // Sala já existe, apenas atualizar
      room = await _apiService.getRoomById(offlineState.roomId!);
    } else {
      // Criar nova sala
      final roomCreate = RoomCreate(
        name: 'Sala ${DateTime.now().toIso8601String()}',
        description: 'Sala criada a partir de modo offline',
        accessType: RoomAccessType.public,
        autoDestroyOnEmpty: false,
      );
      room = await _apiService.createRoom(roomCreate);
    }

    // Adicionar praises à sala online
    for (final praiseId in offlineState.praiseIds) {
      try {
        await _apiService.addPraiseToRoom(room.id, praiseId);
      } catch (e) {
        // Ignorar erros de praise já adicionado
        // TODO: Verificar tipo de erro específico
      }
    }

    return room;
  }

  /// Migra a sala para modo online
  /// Sincroniza dados e atualiza o estado
  Future<void> migrateToOnlineMode(
    WidgetRef ref,
    RoomOfflineState offlineState,
  ) async {
    // Sincronizar com backend
    final room = await syncRoomToOnline(offlineState);

    // Atualizar estado offline com o roomId
    final notifier = ref.read(currentRoomOfflineStateProvider.notifier);
    await notifier.setRoomId(room.id);

    // TODO: Conectar SSE para atualizações em tempo real
    // Isso será implementado quando a funcionalidade de SSE estiver pronta
  }
}
