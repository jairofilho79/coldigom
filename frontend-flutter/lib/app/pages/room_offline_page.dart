import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_button.dart';
import '../widgets/room_material_selector_dialog.dart';
import '../providers/room_providers.dart';
import '../providers/praise_list_providers.dart';
import '../models/praise_model.dart';
import '../models/room_offline_model.dart';
import '../services/api/api_service.dart';
import '../services/room_sync_service.dart';
import '../models/room_model.dart';
import 'praise_detail_page.dart'; // Para importar praiseProvider
import '../../core/i18n/entity_translation_helper.dart';

class RoomOfflinePage extends ConsumerStatefulWidget {
  final String? roomId;

  const RoomOfflinePage({
    super.key,
    this.roomId,
  });

  @override
  ConsumerState<RoomOfflinePage> createState() => _RoomOfflinePageState();
}

class _RoomOfflinePageState extends ConsumerState<RoomOfflinePage> with TickerProviderStateMixin {
  TabController? _tabController;

  @override
  void initState() {
    super.initState();
    // Inicializar com 2 abas (será atualizado se sala estiver online)
    _tabController = TabController(length: 2, vsync: this);
    
    // Carregar estado inicial se não existir
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final state = ref.read(currentRoomOfflineStateProvider);
      if (state == null) {
        ref.read(currentRoomOfflineStateProvider.notifier).createNewRoom();
      }
    });
  }

  void _updateTabControllerIfNeeded(int newTabCount) {
    if (_tabController == null || _tabController!.length != newTabCount) {
      final oldIndex = _tabController?.index ?? 0;
      _tabController?.dispose();
      _tabController = TabController(
        length: newTabCount,
        vsync: this,
        initialIndex: oldIndex < newTabCount ? oldIndex : 0,
      );
    }
  }

  @override
  void dispose() {
    _tabController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final roomState = ref.watch(currentRoomOfflineStateProvider);
    final playlist = ref.watch(roomPlaylistProvider);
    final praiseIds = ref.watch(roomPraisesProvider);

    final isOnline = roomState?.roomId != null;
    final tabCount = isOnline ? 4 : 2;
    
    // Atualizar TabController se necessário (deve ser feito antes de renderizar)
    _updateTabControllerIfNeeded(tabCount);

    return AppScaffold(
      appBar: AppBar(
        title: Text(isOnline ? 'Sala Online' : 'Sala Offline'),
        bottom: TabBar(
          controller: _tabController!,
          tabs: [
            Tab(
              icon: const Icon(Icons.music_note),
              text: 'Louvores (${praiseIds.length})',
            ),
            Tab(
              icon: const Icon(Icons.playlist_play),
              text: 'Playlist (${playlist.length})',
            ),
            if (isOnline) ...[
              Tab(
                icon: const Icon(Icons.chat),
                text: 'Chat',
              ),
              Tab(
                icon: const Icon(Icons.people),
                text: 'Participantes',
              ),
            ],
          ],
        ),
        actions: [
          if (!isOnline)
            IconButton(
              icon: const Icon(Icons.cloud_upload),
              tooltip: 'Tornar Online',
              onPressed: () => _showMakeOnlineDialog(context, ref),
            ),
        ],
      ),
      body: TabBarView(
        controller: _tabController!,
        children: [
          _buildPraisesTab(context, ref, praiseIds),
          _buildPlaylistTab(context, ref, playlist),
          if (isOnline) ...[
            _buildChatTab(context, ref, roomState!.roomId!),
            _buildParticipantsTab(context, ref, roomState.roomId!),
          ],
        ],
      ),
    );
  }

  Widget _buildPraisesTab(BuildContext context, WidgetRef ref, List<String> praiseIds) {

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: AppButton(
                  text: 'Adicionar Louvor',
                  icon: Icons.add,
                  onPressed: () => _showAddPraiseDialog(context, ref),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AppButton(
                  text: 'Importar Lista',
                  icon: Icons.import_export,
                  onPressed: () => _showImportListDialog(context, ref),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: praiseIds.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AppEmptyWidget(
                        message: 'Nenhum louvor adicionado',
                        icon: Icons.music_note,
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: praiseIds.length,
                  itemBuilder: (context, index) {
                    final praiseId = praiseIds[index];
                    return _buildPraiseCard(context, ref, praiseId);
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildPraiseCard(BuildContext context, WidgetRef ref, String praiseId) {
    final praiseAsync = ref.watch(praiseProvider(praiseId));

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: praiseAsync.when(
          data: (praise) => Text(praise.name),
          loading: () => const Text('Carregando...'),
          error: (_, __) => const Text('Erro ao carregar'),
        ),
        subtitle: praiseAsync.when(
          data: (praise) => Text('${praise.materials.length} materiais'),
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.info_outline),
              tooltip: 'Ver detalhes do louvor',
              onPressed: () {
                context.push('/praises/$praiseId');
              },
            ),
            IconButton(
              icon: const Icon(Icons.delete),
              tooltip: 'Remover louvor',
              onPressed: () => _removePraise(context, ref, praiseId),
            ),
          ],
        ),
        onTap: () => _showMaterialSelectorDialog(context, ref, praiseId),
      ),
    );
  }

  Widget _buildPlaylistTab(BuildContext context, WidgetRef ref, List<PlaylistItem> playlist) {
    if (playlist.isEmpty) {
      return Center(
        child: AppEmptyWidget(
          message: 'Playlist vazia. Adicione materiais dos louvores.',
          icon: Icons.playlist_play,
        ),
      );
    }

    return ReorderableListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: playlist.length,
      buildDefaultDragHandles: false, // Remove o handle padrão
      onReorder: (oldIndex, newIndex) {
        if (newIndex > oldIndex) newIndex--;
        final newOrder = List<PlaylistItem>.from(playlist);
        final item = newOrder.removeAt(oldIndex);
        newOrder.insert(newIndex, item);
        ref.read(currentRoomOfflineStateProvider.notifier).reorderPlaylist(newOrder);
      },
      itemBuilder: (context, index) {
        final item = playlist[index];
        return _buildPlaylistItemCard(context, ref, item, index);
      },
    );
  }

  Widget _buildPlaylistItemCard(BuildContext context, WidgetRef ref, PlaylistItem item, int index) {
    final isPdf = item.materialTypeName.toUpperCase() == 'PDF';
    final icon = isPdf ? Icons.picture_as_pdf : Icons.text_fields;

    return Card(
      key: ValueKey(item.materialId),
      margin: const EdgeInsets.only(bottom: 8),
      child: ReorderableDragStartListener(
        index: index,
        child: InkWell(
          onTap: () => _openMaterial(context, ref, item, index),
          child: ListTile(
            leading: Icon(icon, color: isPdf ? Colors.red : Colors.blue),
            title: Text(item.praiseName),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.materialKindId != null
                      ? getMaterialKindName(ref, item.materialKindId!, item.materialKindName)
                      : item.materialKindName,
                ),
                Text('Ordem: ${index + 1}'),
              ],
            ),
            trailing: IconButton(
              icon: const Icon(Icons.delete),
              tooltip: 'Remover',
              onPressed: () => _removeMaterialFromPlaylist(context, ref, item.materialId),
            ),
          ),
        ),
      ),
    );
  }

  void _showAddPraiseDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => _AddPraiseDialog(
        onPraiseSelected: (praiseId) {
          ref.read(currentRoomOfflineStateProvider.notifier).addPraise(praiseId);
          Navigator.of(context).pop();
        },
      ),
    );
  }

  Future<void> _showImportListDialog(BuildContext context, WidgetRef ref) async {
    showDialog(
      context: context,
      builder: (context) => _ImportListDialog(
        onListSelected: (listId) async {
          Navigator.of(context).pop();
          await _importListToRoom(context, ref, listId);
        },
      ),
    );
  }

  Future<void> _importListToRoom(BuildContext context, WidgetRef ref, String listId) async {
    // Mostrar loading
    if (!context.mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );

    try {
      // Obter detalhes da lista
      final listDetail = await ref.read(praiseListByIdProvider(listId).future);
      final notifier = ref.read(currentRoomOfflineStateProvider.notifier);

      // Adicionar todos os louvores da lista à sala
      int addedCount = 0;
      for (final praiseInList in listDetail.praises) {
        try {
          await notifier.addPraise(praiseInList.id);
          addedCount++;
        } catch (e) {
          // Ignorar erros de louvor já adicionado
        }
      }

      if (!context.mounted) return;
      Navigator.of(context).pop(); // Fechar loading

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$addedCount louvor(es) importado(s) da lista "${listDetail.name}"'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      Navigator.of(context).pop(); // Fechar loading

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao importar lista: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _showMaterialSelectorDialog(BuildContext context, WidgetRef ref, String praiseId) {
    showDialog(
      context: context,
      builder: (context) => RoomMaterialSelectorDialog(praiseId: praiseId),
    );
  }

  void _removePraise(BuildContext context, WidgetRef ref, String praiseId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remover Louvor'),
        content: const Text('Tem certeza que deseja remover este louvor da sala?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () {
              ref.read(currentRoomOfflineStateProvider.notifier).removePraise(praiseId);
              Navigator.of(context).pop();
            },
            child: const Text('Remover'),
          ),
        ],
      ),
    );
  }

  void _removeMaterialFromPlaylist(BuildContext context, WidgetRef ref, String materialId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remover da Playlist'),
        content: const Text('Tem certeza que deseja remover este material da playlist?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () {
              ref.read(currentRoomOfflineStateProvider.notifier).removeMaterialFromPlaylist(materialId);
              Navigator.of(context).pop();
            },
            child: const Text('Remover'),
          ),
        ],
      ),
    );
  }

  void _openMaterial(BuildContext context, WidgetRef ref, PlaylistItem item, int index) {
    final isPdf = item.materialTypeName.toUpperCase() == 'PDF';
    final roomState = ref.read(currentRoomOfflineStateProvider);
    
    // Atualizar índice atual
    ref.read(currentRoomOfflineStateProvider.notifier).setCurrentMaterialIndex(index);
    
    final materialKindIdParam = item.materialKindId != null 
        ? '&materialKindId=${Uri.encodeComponent(item.materialKindId!)}' 
        : '';
    
    if (isPdf) {
      context.push(
        '/materials/${item.materialId}/view?praiseName=${Uri.encodeComponent(item.praiseName)}&materialKindName=${Uri.encodeComponent(item.materialKindName)}$materialKindIdParam&roomId=${roomState?.roomId ?? ''}&playlistIndex=$index&playlistLength=${roomState?.playlist.length ?? 0}',
      );
    } else {
      context.push(
        '/materials/${item.materialId}/text?praiseName=${Uri.encodeComponent(item.praiseName)}&materialKindName=${Uri.encodeComponent(item.materialKindName)}$materialKindIdParam&roomId=${roomState?.roomId ?? ''}&playlistIndex=$index&playlistLength=${roomState?.playlist.length ?? 0}',
      );
    }
  }

  Future<void> _showMakeOnlineDialog(BuildContext context, WidgetRef ref) async {
    final roomState = ref.read(currentRoomOfflineStateProvider);
    if (roomState == null || roomState.praiseIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Adicione pelo menos um louvor antes de tornar a sala online'),
        ),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Tornar Sala Online'),
        content: Text(
          'Esta ação irá:\n'
          '1. Criar uma sala no servidor\n'
          '2. Adicionar ${roomState.praiseIds.length} louvor(es) à sala\n'
          '3. Tornar a sala disponível para outros usuários\n\n'
          'Deseja continuar?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Tornar Online'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    // Mostrar loading
    if (!context.mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );

    try {
      final syncService = ref.read(roomSyncServiceProvider);
      await syncService.migrateToOnlineMode(ref, roomState);

      if (!context.mounted) return;
      Navigator.of(context).pop(); // Fechar loading

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sala tornada online com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      Navigator.of(context).pop(); // Fechar loading

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao tornar sala online: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Widget _buildChatTab(BuildContext context, WidgetRef ref, String roomId) {
    // TODO: Implementar chat com SSE quando disponível
    // Por enquanto, apenas uma interface básica
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          Text(
            'Chat em desenvolvimento',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }

  Widget _buildParticipantsTab(BuildContext context, WidgetRef ref, String roomId) {
    final participantsAsync = ref.watch(roomParticipantsProvider(roomId));
    final roomDetailAsync = ref.watch(roomDetailProvider(roomId));

    return participantsAsync.when(
      data: (participants) {
        return Column(
          children: [
            // Botão de compartilhar
            Padding(
              padding: const EdgeInsets.all(16),
              child: roomDetailAsync.when(
                data: (roomDetail) {
                  return AppButton(
                    text: 'Compartilhar Sala',
                    icon: Icons.share,
                    onPressed: () => _shareRoom(context, roomDetail),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            // Lista de participantes
            Expanded(
              child: participants.isEmpty
                  ? Center(
                      child: AppEmptyWidget(
                        message: 'Nenhum participante na sala',
                        icon: Icons.people_outline,
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: participants.length,
                      itemBuilder: (context, index) {
                        final participant = participants[index];
                        final username = participant['username'] as String? ?? 'Usuário';
                        final userId = participant['user_id'] as String? ?? '';
                        
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            leading: CircleAvatar(
                              child: Text(username[0].toUpperCase()),
                            ),
                            title: Text(username),
                            subtitle: userId.isNotEmpty ? Text('ID: $userId') : null,
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text('Erro ao carregar participantes: $error'),
          ],
        ),
      ),
    );
  }

  Future<void> _shareRoom(BuildContext context, RoomDetailResponse room) async {
    final roomCode = room.code;
    final shareText = 'Junte-se à sala "${room.name}" usando o código: $roomCode';
    
    // Mostrar diálogo com código para copiar
    if (context.mounted) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Compartilhar Sala'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Código da sala:'),
              const SizedBox(height: 8),
              SelectableText(
                roomCode,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 16),
              Text(shareText),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Fechar'),
            ),
            ElevatedButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: roomCode));
                if (context.mounted) {
                  Navigator.of(context).pop();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Código copiado para área de transferência'),
                      backgroundColor: Colors.green,
                    ),
                  );
                }
              },
              child: const Text('Copiar Código'),
            ),
          ],
        ),
      );
    }
  }
}

class _AddPraiseDialog extends ConsumerStatefulWidget {
  final Function(String) onPraiseSelected;

  const _AddPraiseDialog({required this.onPraiseSelected});

  @override
  ConsumerState<_AddPraiseDialog> createState() => _AddPraiseDialogState();
}

class _AddPraiseDialogState extends ConsumerState<_AddPraiseDialog> {
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Usar provider de praises com busca
    final queryParams = PraiseQueryParams(
      skip: 0,
      limit: 100,
      name: _searchQuery.isEmpty ? null : _searchQuery,
    );
    final praisesAsync = ref.watch(praisesProvider(queryParams));

    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        height: MediaQuery.of(context).size.height * 0.8,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Selecionar Louvor',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: TextField(
                controller: _searchController,
                decoration: const InputDecoration(
                  hintText: 'Buscar louvor...',
                  prefixIcon: Icon(Icons.search),
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) {
                  setState(() {
                    _searchQuery = value;
                  });
                },
              ),
            ),
            Expanded(
              child: praisesAsync.when(
                data: (praises) {
                  if (praises.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.search_off, size: 64, color: Colors.grey),
                          const SizedBox(height: 16),
                          Text(
                            _searchQuery.isEmpty
                                ? 'Nenhum louvor encontrado'
                                : 'Nenhum louvor encontrado para "$_searchQuery"',
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                        ],
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: praises.length,
                    itemBuilder: (context, index) {
                      final praise = praises[index];
                      return ListTile(
                        title: Text(praise.name),
                        subtitle: praise.number != null ? Text('Número: ${praise.number}') : null,
                        trailing: const Icon(Icons.add),
                        onTap: () {
                          widget.onPraiseSelected(praise.id);
                        },
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, stack) => Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text('Erro ao carregar louvores: $error'),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChatTab(BuildContext context, WidgetRef ref, String roomId) {
    // TODO: Implementar chat com SSE quando disponível
    // Por enquanto, apenas uma interface básica
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          Text(
            'Chat em desenvolvimento',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }

  Widget _buildParticipantsTab(BuildContext context, WidgetRef ref, String roomId) {
    final participantsAsync = ref.watch(roomParticipantsProvider(roomId));
    final roomDetailAsync = ref.watch(roomDetailProvider(roomId));

    return participantsAsync.when(
      data: (participants) {
        return Column(
          children: [
            // Botão de compartilhar
            Padding(
              padding: const EdgeInsets.all(16),
              child: roomDetailAsync.when(
                data: (roomDetail) {
                  return AppButton(
                    text: 'Compartilhar Sala',
                    icon: Icons.share,
                    onPressed: () => _shareRoom(context, roomDetail),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            // Lista de participantes
            Expanded(
              child: participants.isEmpty
                  ? Center(
                      child: AppEmptyWidget(
                        message: 'Nenhum participante na sala',
                        icon: Icons.people_outline,
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: participants.length,
                      itemBuilder: (context, index) {
                        final participant = participants[index];
                        final username = participant['username'] as String? ?? 'Usuário';
                        final userId = participant['user_id'] as String? ?? '';
                        
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            leading: CircleAvatar(
                              child: Text(username[0].toUpperCase()),
                            ),
                            title: Text(username),
                            subtitle: userId.isNotEmpty ? Text('ID: $userId') : null,
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text('Erro ao carregar participantes: $error'),
          ],
        ),
      ),
    );
  }

  Future<void> _shareRoom(BuildContext context, RoomDetailResponse room) async {
    final roomCode = room.code;
    final shareText = 'Junte-se à sala "${room.name}" usando o código: $roomCode';
    
    // Mostrar diálogo com código para copiar
    if (context.mounted) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Compartilhar Sala'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Código da sala:'),
              const SizedBox(height: 8),
              SelectableText(
                roomCode,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 16),
              Text(shareText),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Fechar'),
            ),
            ElevatedButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: roomCode));
                if (context.mounted) {
                  Navigator.of(context).pop();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Código copiado para área de transferência'),
                      backgroundColor: Colors.green,
                    ),
                  );
                }
              },
              child: const Text('Copiar Código'),
            ),
          ],
        ),
      );
    }
  }
}

// Importar PraiseQueryParams e praisesProvider de praise_list_page
// Como são definidos lá, vamos criar uma versão local ou importar
class PraiseQueryParams {
  final int skip;
  final int limit;
  final String? name;
  final String? tagId;

  PraiseQueryParams({
    required this.skip,
    required this.limit,
    this.name,
    this.tagId,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PraiseQueryParams &&
          runtimeType == other.runtimeType &&
          skip == other.skip &&
          limit == other.limit &&
          name == other.name &&
          tagId == other.tagId;

  @override
  int get hashCode => skip.hashCode ^ limit.hashCode ^ (name?.hashCode ?? 0) ^ (tagId?.hashCode ?? 0);
}

final praisesProvider = FutureProvider.family<List<PraiseResponse>, PraiseQueryParams>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getPraises(
      skip: params.skip,
      limit: params.limit,
      name: params.name,
      tagId: params.tagId,
    );
  },
);

class _ImportListDialog extends ConsumerStatefulWidget {
  final Function(String) onListSelected;

  const _ImportListDialog({required this.onListSelected});

  @override
  ConsumerState<_ImportListDialog> createState() => _ImportListDialogState();
}

class _ImportListDialogState extends ConsumerState<_ImportListDialog> {
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Buscar listas do usuário
    final queryParams = PraiseListQueryParams(
      name: _searchQuery.isEmpty ? null : _searchQuery,
    );
    final listsAsync = ref.watch(praiseListsProvider(queryParams));

    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        height: MediaQuery.of(context).size.height * 0.8,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Importar Lista de Louvores',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: TextField(
                controller: _searchController,
                decoration: const InputDecoration(
                  hintText: 'Buscar lista...',
                  prefixIcon: Icon(Icons.search),
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) {
                  setState(() {
                    _searchQuery = value;
                  });
                },
              ),
            ),
            Expanded(
              child: listsAsync.when(
                data: (lists) {
                  if (lists.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.search_off, size: 64, color: Colors.grey),
                          const SizedBox(height: 16),
                          Text(
                            _searchQuery.isEmpty
                                ? 'Nenhuma lista encontrada'
                                : 'Nenhuma lista encontrada para "$_searchQuery"',
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                        ],
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: lists.length,
                    itemBuilder: (context, index) {
                      final list = lists[index];
                      return ListTile(
                        leading: const Icon(Icons.list),
                        title: Text(list.name),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (list.description != null && list.description!.isNotEmpty)
                              Text(list.description!),
                            Text('${list.praisesCount} louvor(es)'),
                            if (list.owner != null) Text('Por: ${list.owner}'),
                          ],
                        ),
                        trailing: const Icon(Icons.arrow_forward),
                        onTap: () {
                          widget.onListSelected(list.id);
                        },
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, stack) => Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text('Erro ao carregar listas: $error'),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
