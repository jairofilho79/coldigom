import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../services/api/api_service.dart';
import '../providers/room_providers.dart';
import '../../core/i18n/entity_translation_helper.dart';

class TextViewerPage extends ConsumerStatefulWidget {
  final String materialId;
  final String praiseName;
  final String materialKindName;
  final String? materialKindId;
  final String? roomId;
  final int? playlistIndex;
  final int? playlistLength;

  const TextViewerPage({
    super.key,
    required this.materialId,
    required this.praiseName,
    required this.materialKindName,
    this.materialKindId,
    this.roomId,
    this.playlistIndex,
    this.playlistLength,
  });

  @override
  ConsumerState<TextViewerPage> createState() => _TextViewerPageState();
}

class _TextViewerPageState extends ConsumerState<TextViewerPage> {
  String? _textContent;
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadTextContent();
  }

  @override
  void didUpdateWidget(TextViewerPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Se o materialId mudou, recarregar o conteúdo
    if (oldWidget.materialId != widget.materialId) {
      _loadTextContent();
    }
  }

  Future<void> _loadTextContent() async {
    // Resetar estado ao carregar novo conteúdo
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _textContent = null;
    });

    try {
      final apiService = ref.read(apiServiceProvider);
      final material = await apiService.getMaterialById(widget.materialId);
      
      // Para materiais de texto, o conteúdo pode estar no path (URL ou texto direto)
      if (material.path.startsWith('http://') || material.path.startsWith('https://')) {
        // É uma URL, fazer download do conteúdo
        final dio = apiService.dio;
        final response = await dio.get(material.path);
        _textContent = response.data.toString();
      } else {
        // Assume que é texto direto
        _textContent = material.path;
      }

      setState(() {
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Erro ao carregar conteúdo: $e';
        _isLoading = false;
      });
    }
  }

  void _navigateToNext() {
    if (widget.playlistIndex == null || widget.playlistLength == null) return;
    if (widget.playlistIndex! >= widget.playlistLength! - 1) return;

    final roomState = ref.read(currentRoomOfflineStateProvider);
    if (roomState == null) return;

    final nextIndex = widget.playlistIndex! + 1;
    final nextItem = roomState.playlist[nextIndex];
    final isPdf = nextItem.materialTypeName.toUpperCase() == 'PDF';
    final materialKindIdParam = nextItem.materialKindId != null 
        ? '&materialKindId=${Uri.encodeComponent(nextItem.materialKindId!)}' 
        : '';

    // Atualizar índice atual
    ref.read(currentRoomOfflineStateProvider.notifier).setCurrentMaterialIndex(nextIndex);

    if (isPdf) {
      context.go(
        '/materials/${nextItem.materialId}/view?praiseName=${Uri.encodeComponent(nextItem.praiseName)}&materialKindName=${Uri.encodeComponent(nextItem.materialKindName)}$materialKindIdParam&roomId=${widget.roomId ?? ''}&playlistIndex=$nextIndex&playlistLength=${widget.playlistLength}',
      );
    } else {
      context.go(
        '/materials/${nextItem.materialId}/text?praiseName=${Uri.encodeComponent(nextItem.praiseName)}&materialKindName=${Uri.encodeComponent(nextItem.materialKindName)}$materialKindIdParam&roomId=${widget.roomId ?? ''}&playlistIndex=$nextIndex&playlistLength=${widget.playlistLength}',
      );
    }
  }


  @override
  Widget build(BuildContext context) {
    final hasNavigation = widget.playlistIndex != null && widget.playlistLength != null && widget.playlistLength! > 1;
    final canGoNext = hasNavigation && widget.playlistIndex! < widget.playlistLength! - 1;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            // Se há roomId, voltar para a sala, senão tentar pop
            if (widget.roomId != null) {
              context.go('/rooms/offline/${widget.roomId}');
            } else {
              if (context.canPop()) {
                context.pop();
              } else {
                context.go('/');
              }
            }
          },
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.materialKindName.isNotEmpty 
                  ? (widget.materialKindId != null
                      ? getMaterialKindName(ref, widget.materialKindId!, widget.materialKindName)
                      : widget.materialKindName)
                  : 'Texto',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (widget.praiseName.isNotEmpty)
              Text(
                widget.praiseName,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.white70,
                    ),
              ),
          ],
        ),
        actions: [
          // Ícone de playlist - clique vai para próximo, segurar mostra lista
          if (hasNavigation)
            GestureDetector(
              onTap: () {
                if (canGoNext) {
                  _navigateToNext();
                } else {
                  // Se não pode ir para próximo, vai para o primeiro
                  _navigateToMaterial(0);
                }
              },
              onLongPress: () => _showPlaylistDialog(context, ref),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Icon(
                  Icons.playlist_play,
                  color: canGoNext ? null : Colors.grey,
                ),
              ),
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  void _navigateToMaterial(int index) {
    if (widget.playlistIndex == null || widget.playlistLength == null) return;
    if (index < 0 || index >= widget.playlistLength!) return;

    final roomState = ref.read(currentRoomOfflineStateProvider);
    if (roomState == null) return;

    final item = roomState.playlist[index];
    final isPdf = item.materialTypeName.toUpperCase() == 'PDF';
    final materialKindIdParam = item.materialKindId != null 
        ? '&materialKindId=${Uri.encodeComponent(item.materialKindId!)}' 
        : '';

    // Atualizar índice atual
    ref.read(currentRoomOfflineStateProvider.notifier).setCurrentMaterialIndex(index);

    if (isPdf) {
      context.go(
        '/materials/${item.materialId}/view?praiseName=${Uri.encodeComponent(item.praiseName)}&materialKindName=${Uri.encodeComponent(item.materialKindName)}$materialKindIdParam&roomId=${widget.roomId ?? ''}&playlistIndex=$index&playlistLength=${widget.playlistLength}',
      );
    } else {
      context.go(
        '/materials/${item.materialId}/text?praiseName=${Uri.encodeComponent(item.praiseName)}&materialKindName=${Uri.encodeComponent(item.materialKindName)}$materialKindIdParam&roomId=${widget.roomId ?? ''}&playlistIndex=$index&playlistLength=${widget.playlistLength}',
      );
    }
  }

  void _showPlaylistDialog(BuildContext context, WidgetRef ref) {
    if (widget.playlistIndex == null || widget.playlistLength == null) return;

    final roomState = ref.read(currentRoomOfflineStateProvider);
    if (roomState == null) return;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Playlist de Materiais'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: roomState.playlist.length,
            itemBuilder: (context, index) {
              final item = roomState.playlist[index];
              final isCurrent = index == widget.playlistIndex;
              final isPdf = item.materialTypeName.toUpperCase() == 'PDF';
              
              return ListTile(
                leading: Icon(
                  isPdf ? Icons.picture_as_pdf : Icons.text_fields,
                  color: isPdf ? Colors.red : Colors.blue,
                ),
                title: Text(
                  item.praiseName,
                  style: TextStyle(
                    fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
                subtitle: Text(
                  item.materialKindId != null
                      ? getMaterialKindName(ref, item.materialKindId!, item.materialKindName)
                      : item.materialKindName,
                ),
                trailing: isCurrent ? const Icon(Icons.check, color: Colors.green) : null,
                onTap: () {
                  Navigator.of(context).pop();
                  if (index != widget.playlistIndex) {
                    _navigateToMaterial(index);
                  }
                },
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Fechar'),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text(
              _errorMessage!,
              style: Theme.of(context).textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadTextContent,
              child: const Text('Tentar Novamente'),
            ),
          ],
        ),
      );
    }

    if (_textContent == null || _textContent!.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.text_fields, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              'Conteúdo vazio',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: SelectableText(
        _textContent!,
        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              height: 1.6,
            ),
      ),
    );
  }

}
