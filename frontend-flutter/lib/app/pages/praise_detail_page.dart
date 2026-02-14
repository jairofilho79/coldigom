import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_button.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/material_manager_widget.dart';
import '../widgets/add_to_list_button.dart';
import '../services/api/api_service.dart';
import '../services/connectivity_service.dart';
import '../services/offline/download_service.dart';
import '../services/offline/praise_cache_service.dart';
import '../models/praise_model.dart';

/// Provider para um praise específico (híbrido: API quando online, cache quando offline)
final praiseProvider = FutureProvider.family<PraiseResponse, String>(
  (ref, id) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final cacheService = ref.read(praiseCacheServiceProvider);

    final isOnline = await connectivityService.isOnline();
    if (isOnline) {
      return await apiService.getPraiseById(id);
    }

    // Offline: buscar do cache
    final cached = cacheService.getCachedPraises();
    try {
      return cached.firstWhere((p) => p.id == id);
    } catch (_) {
      throw Exception('Praise não encontrado no cache offline');
    }
  },
);

/// Provider para verificar se está online (usado para desabilitar ações online-only)
final isOnlineForDetailProvider = FutureProvider<bool>((ref) async {
  final connectivityService = ref.read(connectivityServiceProvider);
  return await connectivityService.isOnline();
});

/// Provider para ação de revisão
final praiseReviewActionProvider = FutureProvider.family<PraiseResponse, ReviewActionParams>(
  (ref, params) async {
    // Nota: Este provider não é mais usado, mas mantido para compatibilidade
    throw UnimplementedError('Use apiService.reviewAction diretamente');
  },
);

class ReviewActionParams {
  final String praiseId;
  final ReviewActionRequest request;

  ReviewActionParams({
    required this.praiseId,
    required this.request,
  });
}

class PraiseDetailPage extends ConsumerWidget {
  final String praiseId;

  const PraiseDetailPage({
    super.key,
    required this.praiseId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final praiseAsync = ref.watch(praiseProvider(praiseId));
    final isOnlineAsync = ref.watch(isOnlineForDetailProvider);
    final l10n = AppLocalizations.of(context)!;
    final isOnline = isOnlineAsync.value ?? false;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitlePraiseDetails),
        actions: [
          IconButton(
            icon: const Icon(Icons.download),
            tooltip: isOnline ? l10n.tooltipDownloadZip : 'Funcionalidade disponível com conexão',
            onPressed: isOnline ? () => _downloadPraiseZip(context, ref, praiseId) : null,
          ),
          IconButton(
            icon: const Icon(Icons.edit),
            tooltip: isOnline ? null : 'Funcionalidade disponível com conexão',
            onPressed: isOnline ? () => context.push('/praises/$praiseId/edit') : null,
          ),
          IconButton(
            icon: const Icon(Icons.delete),
            tooltip: isOnline ? null : 'Funcionalidade disponível com conexão',
            onPressed: isOnline ? () => _showDeleteDialog(context, ref) : null,
          ),
        ],
      ),
      body: praiseAsync.when(
        data: (praise) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header com nome e número
              Row(
                children: [
                  Expanded(
                    child: Text(
                      praise.name,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ),
                  if (praise.number != null)
                    Chip(
                      label: Text(l10n.badgeNumber(praise.number!)),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
              const SizedBox(height: 16),

              // Metadados estendidos (author, rhythm, tonality, category)
              if (praise.author != null ||
                  praise.rhythm != null ||
                  praise.tonality != null ||
                  praise.category != null) ...[
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (praise.author != null && praise.author!.isNotEmpty)
                        _buildMetadataRow(
                          context,
                          Icons.person,
                          'Autor',
                          praise.author!,
                        ),
                      if (praise.rhythm != null && praise.rhythm!.isNotEmpty)
                        _buildMetadataRow(
                          context,
                          Icons.music_note,
                          'Ritmo',
                          praise.rhythm!,
                        ),
                      if (praise.tonality != null && praise.tonality!.isNotEmpty)
                        _buildMetadataRow(
                          context,
                          Icons.tune,
                          'Tom',
                          praise.tonality!,
                        ),
                      if (praise.category != null && praise.category!.isNotEmpty)
                        _buildMetadataRow(
                          context,
                          Icons.category,
                          'Categoria',
                          praise.category!,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Status de revisão
              if (praise.inReview) ...[
                AppCard(
                  child: Row(
                    children: [
                      const Icon(Icons.rate_review, color: Colors.orange),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l10n.statusInReview,
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                            if (praise.inReviewDescription != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                praise.inReviewDescription!,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Tags
              if (praise.tags.isNotEmpty) ...[
                Text(
                  l10n.sectionTags,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: praise.tags
                      .map((tag) {
                        final tagName = getPraiseTagName(ref, tag.id, tag.name);
                        return ActionChip(
                          label: Text(tagName),
                          visualDensity: VisualDensity.compact,
                          onPressed: () {
                            // Navegar para lista de praises filtrada por esta tag
                            context.push('/praises?tagId=${tag.id}');
                          },
                        );
                      })
                      .toList(),
                ),
                const SizedBox(height: 24),
              ],

              // Adicionar à lista
              AddToListButton(
                praiseId: praiseId,
                onAdded: () {
                  ref.invalidate(praiseProvider(praiseId));
                },
              ),
              const SizedBox(height: 16),

              // Materiais
              MaterialManagerWidget(
                praiseId: praiseId,
                praiseName: praise.name,
                materials: praise.materials,
                isEditMode: false,
              ),

              const SizedBox(height: 24),

              // Histórico de revisão
              if (praise.reviewHistory.isNotEmpty) ...[
                Text(
                  l10n.sectionReviewHistory,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                ...praise.reviewHistory.map((event) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                        child: AppCard(
                        child: ListTile(
                          leading: Icon(_getReviewIcon(event.type)),
                          title: Text(_getReviewActionName(event.type, context)),
                          subtitle: Text(_formatDate(event.date)),
                        ),
                      ),
                    )),
              ],

              const SizedBox(height: 24),

              // Ações de revisão
              if (!praise.inReview)
                AppButton(
                  text: l10n.actionStartReview,
                  icon: Icons.rate_review,
                  onPressed: () => _showStartReviewDialog(context, ref, praiseId),
                )
              else ...[
                Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        text: l10n.actionCancelReview,
                        icon: Icons.cancel,
                        onPressed: () => _cancelReview(context, ref, praiseId),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: AppButton(
                        text: l10n.actionFinishReview,
                        icon: Icons.check_circle,
                        onPressed: () => _finishReview(context, ref, praiseId),
                      ),
                    ),
                  ],
                ),
              ],

              const SizedBox(height: 24),

              // Informações de data
              Text(
                'Criado em: ${_formatDate(praise.createdAt)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              Text(
                'Atualizado em: ${_formatDate(praise.updatedAt)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        loading: () => AppLoadingIndicator(message: l10n.statusLoading),
        error: (error, stack) => AppErrorWidget(
          message: 'Erro ao carregar praise: $error',
          onRetry: () {
            ref.invalidate(praiseProvider(praiseId));
          },
        ),
      ),
    );
  }

  Widget _buildMetadataRow(
    BuildContext context,
    IconData icon,
    String label,
    String value,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
                Text(
                  value,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _getReviewIcon(String type) {
    switch (type) {
      case 'in_review':
        return Icons.rate_review;
      case 'review_cancelled':
        return Icons.cancel;
      case 'review_finished':
        return Icons.check_circle;
      default:
        return Icons.history;
    }
  }

  String _getReviewActionName(String type, BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (l10n == null) return type;
    
    switch (type) {
      case 'in_review':
        return l10n.reviewActionStart;
      case 'review_cancelled':
        return l10n.reviewActionCancel;
      case 'review_finished':
        return l10n.reviewActionFinish;
      default:
        return type;
    }
  }

  String _formatDate(String dateString) {
    try {
      final date = DateTime.parse(dateString);
      return '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return dateString;
    }
  }

  Future<void> _downloadPraiseZip(BuildContext context, WidgetRef ref, String praiseId) async {
    // Verificar se há materiais de arquivo antes de iniciar download
    final praiseAsync = ref.read(praiseProvider(praiseId).future);
    final praise = await praiseAsync;
    
    // Contar materiais de arquivo
    final fileMaterials = praise.materials.where((m) {
      final typeName = m.materialType?.name.toLowerCase() ?? '';
      return typeName == 'pdf' || typeName == 'audio';
    }).toList();

    if (fileMaterials.isEmpty) {
      if (context.mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.dialogMessageNoFileMaterials),
            duration: const Duration(seconds: 3),
          ),
        );
      }
      return;
    }

    // Mostrar dialog de confirmação
    if (!context.mounted) return;
    final l10n = AppLocalizations.of(context)!;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.dialogTitleDownloadZip),
        content: Text(
          'Será baixado um arquivo ZIP contendo ${fileMaterials.length} material(is) de arquivo do praise "${praise.name}".',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.buttonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.buttonDownload),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    // Mostrar dialog de progresso
    if (!context.mounted) return;
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const _DownloadProgressDialog(),
    );

    try {
      final downloadService = ref.read(offlineDownloadServiceProvider);
      
      String? errorMessage;
      final filePath = await downloadService.downloadPraiseZip(
        praiseId,
        praise.name,
        onProgress: (progress) {
          // Progresso pode ser atualizado aqui se necessário
        },
        onError: (error) {
          errorMessage = error;
        },
      );

      if (!context.mounted) return;
      final l10n = AppLocalizations.of(context)!;
      Navigator.of(context).pop(); // Fechar dialog de progresso

      if (errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.errorDownloadZip(errorMessage!)),
            duration: const Duration(seconds: 5),
          ),
        );
      } else if (filePath == null) {
        // Usuário cancelou a seleção de arquivo
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.errorDownloadCanceled),
            duration: const Duration(seconds: 2),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.messageZipSaved(filePath)),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (!context.mounted) return;
      final l10n = AppLocalizations.of(context)!;
      Navigator.of(context).pop(); // Fechar dialog de progresso
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.errorDownloadZip(e.toString())),
          duration: const Duration(seconds: 5),
        ),
      );
    }
  }

  void _showDeleteDialog(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.dialogTitleConfirmDelete),
        content: Text(l10n.dialogMessageDeletePraise),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.buttonCancel),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _deletePraise(context, ref);
            },
            child: Text(l10n.buttonDelete, style: const TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  Future<void> _deletePraise(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deletePraise(praiseId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.successPraiseDeleted)),
        );
        context.go('/praises');
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorDeletePraise(e.toString()))),
        );
      }
    }
  }

  void _showStartReviewDialog(BuildContext context, WidgetRef ref, String praiseId) {
    final l10n = AppLocalizations.of(context)!;
    final descriptionController = TextEditingController();
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.dialogTitleStartReview),
        content: TextField(
          controller: descriptionController,
          decoration: InputDecoration(
            labelText: l10n.dialogLabelReviewDescription,
            hintText: l10n.hintEnterReviewDescription,
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.buttonCancel),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _startReview(context, ref, praiseId, descriptionController.text);
            },
            child: Text(l10n.reviewActionStart),
          ),
        ],
      ),
    );
  }

  Future<void> _startReview(BuildContext context, WidgetRef ref, String praiseId, String description) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);
      final request = ReviewActionRequest(
        action: 'start',
        inReviewDescription: description.isEmpty ? null : description,
      );
      
      await apiService.reviewAction(praiseId, request);
      
      // Invalidar provider para atualizar UI
      ref.invalidate(praiseProvider(praiseId));
      
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.successReviewStarted)),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorStartReview(e.toString()))),
        );
      }
    }
  }

  Future<void> _cancelReview(BuildContext context, WidgetRef ref, String praiseId) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);
      final request = ReviewActionRequest(action: 'cancel');
      
      await apiService.reviewAction(praiseId, request);
      
      // Invalidar provider para atualizar UI
      ref.invalidate(praiseProvider(praiseId));
      
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.successReviewCanceled)),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorCancelReview(e.toString()))),
        );
      }
    }
  }

  Future<void> _finishReview(BuildContext context, WidgetRef ref, String praiseId) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);
      final request = ReviewActionRequest(action: 'finish');
      
      await apiService.reviewAction(praiseId, request);
      
      // Invalidar provider para atualizar UI
      ref.invalidate(praiseProvider(praiseId));
      
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.successReviewFinished)),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorFinishReview(e.toString()))),
        );
      }
    }
  }
}

/// Dialog de progresso de download
class _DownloadProgressDialog extends StatelessWidget {
  const _DownloadProgressDialog();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Builder(
            builder: (context) {
              final l10n = AppLocalizations.of(context);
              return Text(l10n?.statusDownloadingZip ?? 'Baixando ZIP...');
            },
          ),
          const SizedBox(height: 8),
          Text(
            'Por favor, aguarde.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
