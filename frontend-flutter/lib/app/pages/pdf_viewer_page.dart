import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pdfrx/pdfrx.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../services/offline/download_service.dart';
import '../services/api/api_service.dart';
import '../widgets/app_status_widgets.dart';

class PdfViewerPage extends ConsumerStatefulWidget {
  final String materialId;
  final String praiseName;
  final String materialKindName;

  const PdfViewerPage({
    super.key,
    required this.materialId,
    required this.praiseName,
    required this.materialKindName,
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
  void dispose() {
    // PdfViewerController não precisa de dispose explícito
    super.dispose();
  }

  Future<void> _loadPdf() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.materialKindName.isNotEmpty 
                  ? widget.materialKindName 
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
          if (_totalPages > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Center(
                child: Builder(
                  builder: (context) {
                    final l10n = AppLocalizations.of(context);
                    return Text(
                      l10n?.messagePageOf(
                          _currentPage,
                          _totalPages) ?? 
                      '$_currentPage / $_totalPages',
                      style: Theme.of(context).textTheme.bodyMedium,
                    );
                  },
                ),
              ),
            ),
        ],
      ),
      body: _buildBody(),
      bottomNavigationBar: _totalPages > 1 ? _buildNavigationBar() : null,
    );
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

  Widget _buildNavigationBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: _currentPage > 1 ? _goToPreviousPage : null,
              tooltip: 'Página anterior',
            ),
            const SizedBox(width: 16),
            Text(
              'Página $_currentPage de $_totalPages',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(width: 16),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: _currentPage < _totalPages ? _goToNextPage : null,
              tooltip: 'Próxima página',
            ),
          ],
        ),
      ),
    );
  }
}
