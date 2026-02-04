import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pdfrx/pdfrx.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../services/offline/download_service.dart';
import '../services/api/api_service.dart';
import '../widgets/app_status_widgets.dart';
import '../providers/room_providers.dart';
import '../../core/i18n/entity_translation_helper.dart';

class PdfViewerPage extends ConsumerStatefulWidget {
  final String materialId;
  final String praiseName;
  final String materialKindName;
  final String? materialKindId;
  final String? roomId;
  final int? playlistIndex;
  final int? playlistLength;

  const PdfViewerPage({
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
  ConsumerState<PdfViewerPage> createState() => _PdfViewerPageState();
}

class _PdfViewerPageState extends ConsumerState<PdfViewerPage> {
  PdfViewerController? _pdfController;
  String? _filePath;
  bool _isLoading = true;
  bool _isDownloading = false;
  String? _errorMessage;
  int _currentPage = 1;
  int _totalPages = 0;
  double _downloadProgress = 0.0;

  @override
  void initState() {
    super.initState();
    _pdfController = PdfViewerController();
    _loadPdf();
  }

  @override
  void didUpdateWidget(PdfViewerPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Se o materialId mudou, recarregar o PDF
    if (oldWidget.materialId != widget.materialId) {
      _loadPdf();
    }
  }

  @override
  void dispose() {
    // PdfViewerController não precisa de dispose explícito
    super.dispose();
  }

  Future<void> _loadPdf() async {
    // Resetar estado ao carregar novo PDF
    setState(() {
      _isLoading = true;
      _isDownloading = false;
      _errorMessage = null;
      _currentPage = 1;
      _totalPages = 0;
      _downloadProgress = 0.0;
      _filePath = null;
    });

    // Criar novo controller se necessário
    _pdfController = PdfViewerController();

    try {
      final downloadService = ref.read(offlineDownloadServiceProvider);
      
      // Verificar se já está baixado
      final isOffline = await downloadService.isMaterialOffline(widget.materialId);
      String? filePath;

      if (isOffline) {
        // Usar arquivo offline
        filePath = await downloadService.getOfflineFilePath(widget.materialId);
      } else {
        // Baixar o arquivo
        setState(() {
          _isDownloading = true;
          _downloadProgress = 0.0;
        });

        // Obter material completo para download
        final apiService = ref.read(apiServiceProvider);
        final material = await apiService.getMaterialById(widget.materialId);
        
        filePath = await downloadService.downloadMaterial(
          material,
          (progress) {
            setState(() {
              _downloadProgress = progress;
            });
          },
          (error) {
            setState(() {
              _errorMessage = error;
              _isDownloading = false;
            });
          },
        );

        setState(() {
          _isDownloading = false;
        });
      }

      if (filePath == null || !await File(filePath).exists()) {
        throw Exception('Arquivo PDF não encontrado');
      }

      // Armazenar o caminho do arquivo para usar no PdfViewer
      setState(() {
        _filePath = filePath;
        _isLoading = false;
      });
    } catch (e) {
      final l10n = AppLocalizations.of(context);
      setState(() {
        _errorMessage = l10n?.errorLoadPdf ?? 'Erro ao carregar PDF: $e';
        _isLoading = false;
        _isDownloading = false;
      });
    }
  }

  Future<void> _goToPreviousPage() async {
    if (_pdfController != null && _currentPage > 1) {
      await _pdfController!.goToPage(
        pageNumber: _currentPage - 1,
        duration: const Duration(milliseconds: 300),
      );
    }
  }

  Future<void> _goToNextPage() async {
    if (_pdfController != null && _currentPage < _totalPages) {
      await _pdfController!.goToPage(
        pageNumber: _currentPage + 1,
        duration: const Duration(milliseconds: 300),
      );
    }
  }

  Future<void> _goToFirstPage() async {
    if (_pdfController != null && _currentPage > 1) {
      await _pdfController!.goToPage(
        pageNumber: 1,
        duration: const Duration(milliseconds: 300),
      );
    }
  }

  void _navigateToMaterial(int index) {
    if (!_hasPlaylistNavigation) return;
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
    final roomState = ref.read(currentRoomOfflineStateProvider);
    if (roomState == null || !_hasPlaylistNavigation) return;

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

  @override
  Widget build(BuildContext context) {
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
                  : 'PDF',
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
          if (_hasPlaylistNavigation)
            GestureDetector(
              onTap: () {
                if (_canGoToNextMaterial) {
                  _navigateToNextMaterial();
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
                  color: _canGoToNextMaterial ? null : Colors.grey,
                ),
              ),
            ),
          // Contador de páginas - clique avança, segurar vai para primeira
          if (_totalPages > 0)
            GestureDetector(
              onTap: () {
                if (_currentPage < _totalPages) {
                  _goToNextPage();
                } else {
                  // Se está na última página, vai para primeira
                  _goToFirstPage();
                }
              },
              onLongPress: () => _goToFirstPage(),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Center(
                  child: Text(
                    '$_currentPage de $_totalPages',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ),
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  bool get _hasPlaylistNavigation => 
      widget.playlistIndex != null && 
      widget.playlistLength != null && 
      widget.playlistLength! > 1;

  bool get _canGoToNextMaterial => 
      _hasPlaylistNavigation && 
      widget.playlistIndex! < widget.playlistLength! - 1;

  bool get _canGoToPreviousMaterial => 
      _hasPlaylistNavigation && 
      widget.playlistIndex! > 0;

  void _navigateToNextMaterial() {
    if (!_canGoToNextMaterial) return;

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


  Widget _buildBody() {
    if (_isLoading || _isDownloading) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_isDownloading) ...[
              CircularProgressIndicator(value: _downloadProgress),
              const SizedBox(height: 16),
              Builder(
                builder: (context) {
                  final l10n = AppLocalizations.of(context);
                  return Text(
                    '${l10n?.statusDownloadingZip ?? 'Baixando PDF...'} ${(_downloadProgress * 100).toStringAsFixed(0)}%',
                    style: Theme.of(context).textTheme.bodyMedium,
                  );
                },
              ),
            ] else
              const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Builder(
              builder: (context) {
                final l10n = AppLocalizations.of(context);
                return Text(
                  _isDownloading 
                      ? (l10n?.statusDownloadingZip ?? 'Baixando PDF...')
                      : (l10n?.statusLoading ?? 'Carregando PDF...'),
                  style: Theme.of(context).textTheme.bodyMedium,
                );
              },
            ),
          ],
        ),
      );
    }

    if (_errorMessage != null) {
      return AppErrorWidget(
        message: _errorMessage!,
        onRetry: () {
          _loadPdf();
        },
      );
    }

    if (_filePath == null) {
      return const AppEmptyWidget(
        message: 'PDF não disponível',
        icon: Icons.picture_as_pdf,
      );
    }

    return GestureDetector(
      onHorizontalDragEnd: (details) {
        // Threshold mínimo de velocidade para evitar navegação acidental
        const minVelocity = 300.0;
        
        if (details.primaryVelocity != null) {
          if (details.primaryVelocity! > minVelocity) {
            // Swipe para direita = página anterior
            _goToPreviousPage();
          } else if (details.primaryVelocity! < -minVelocity) {
            // Swipe para esquerda = próxima página
            _goToNextPage();
          }
        }
      },
      child: PdfViewer.file(
        _filePath!,
        controller: _pdfController,
        initialPageNumber: 1,
        params: PdfViewerParams(
          // Configurar cache extent para renderizar mais páginas
          // 2.0 significa 200% do viewport (viewport + 1 viewport extra em cada direção)
          // Isso garante que páginas adjacentes sejam renderizadas mesmo em janelas pequenas
          horizontalCacheExtent: 2.0,
          verticalCacheExtent: 2.0,
          // Callback para detectar mudanças de página
          onPageChanged: (pageNumber) {
            if (mounted && pageNumber != null && pageNumber != _currentPage) {
              setState(() {
                _currentPage = pageNumber;
              });
            }
          },
          // Callback quando o documento é carregado
          onDocumentLoadFinished: (documentRef, loadSucceeded) {
            // Não precisamos fazer nada aqui, usaremos onViewerReady para obter o total de páginas
          },
          // Callback quando o viewer está pronto para obter o total de páginas
          onViewerReady: (document, controller) {
            if (mounted) {
              setState(() {
                _totalPages = document.pages.length;
              });
            }
          },
          // Loading banner customizado
          loadingBannerBuilder: (context, bytesDownloaded, totalBytes) => const Center(
            child: CircularProgressIndicator(),
          ),
        ),
      ),
    );
  }

}
