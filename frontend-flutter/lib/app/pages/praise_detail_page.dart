import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_button.dart';
import '../services/api/api_service.dart';
import '../services/offline/download_service.dart';
import '../models/praise_model.dart';
import '../models/praise_material_model.dart';

/// Provider para um praise específico
final praiseProvider = FutureProvider.family<PraiseResponse, String>(
  (ref, id) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getPraiseById(id);
  },
);

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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalhes do Praise'),
        actions: [
          IconButton(
            icon: const Icon(Icons.download),
            tooltip: 'Baixar ZIP',
            onPressed: () => _downloadPraiseZip(context, ref, praiseId),
          ),
          IconButton(
            icon: const Icon(Icons.edit),
            onPressed: () {
              context.push('/praises/$praiseId/edit');
            },
          ),
          IconButton(
            icon: const Icon(Icons.delete),
            onPressed: () => _showDeleteDialog(context, ref),
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
                      label: Text('#${praise.number}'),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
              const SizedBox(height: 16),

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
                              'Em Revisão',
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
                  'Tags',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: praise.tags
                      .map((tag) => Chip(
                            label: Text(tag.name),
                            visualDensity: VisualDensity.compact,
                          ))
                      .toList(),
                ),
                const SizedBox(height: 24),
              ],

              // Materiais
              Text(
                'Materiais (${praise.materials.length})',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (praise.materials.isEmpty)
                const AppEmptyWidget(
                  message: 'Nenhum material cadastrado',
                  icon: Icons.insert_drive_file,
                )
              else
                ...praise.materials.map((material) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AppCard(
                        onTap: () {
                          final isPdf = ((material.materialType?.name ?? '').toUpperCase().contains('FILE')) || 
                                        material.path.endsWith('.pdf');
                          if (isPdf) {
                            context.push(
                              '/materials/${material.id}/view?praiseName=${Uri.encodeComponent(praise.name)}&materialKindName=${Uri.encodeComponent(material.materialKind?.name ?? '')}',
                            );
                          } else {
                            // Comportamento para outros tipos de material
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Visualizar material: ${material.path}')),
                            );
                          }
                        },
                        child: ListTile(
                          leading: Icon(_getMaterialIcon(material)),
                          title: Text(material.materialKind?.name ?? material.materialKindId),
                          subtitle: Text(material.materialType?.name ?? material.materialTypeId),
                          trailing: ((material.materialType?.name ?? '').toUpperCase().contains('FILE')) || 
                                   material.path.endsWith('.pdf')
                              ? IconButton(
                                  icon: const Icon(Icons.download),
                                  onPressed: () {
                                    // TODO: Implementar download
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Baixar material: ${material.path}')),
                                    );
                                  },
                                )
                              : null,
                        ),
                      ),
                    )),

              const SizedBox(height: 24),

              // Histórico de revisão
              if (praise.reviewHistory.isNotEmpty) ...[
                Text(
                  'Histórico de Revisão',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                ...praise.reviewHistory.map((event) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AppCard(
                        child: ListTile(
                          leading: Icon(_getReviewIcon(event.type)),
                          title: Text(_getReviewActionName(event.type)),
                          subtitle: Text(_formatDate(event.date)),
                        ),
                      ),
                    )),
              ],

              const SizedBox(height: 24),

              // Ações de revisão
              if (!praise.inReview)
                AppButton(
                  text: 'Iniciar Revisão',
                  icon: Icons.rate_review,
                  onPressed: () => _showStartReviewDialog(context, ref, praiseId),
                )
              else ...[
                Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        text: 'Cancelar Revisão',
                        icon: Icons.cancel,
                        onPressed: () => _cancelReview(context, ref, praiseId),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: AppButton(
                        text: 'Finalizar Revisão',
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
        loading: () => const AppLoadingIndicator(message: 'Carregando praise...'),
        error: (error, stack) => AppErrorWidget(
          message: 'Erro ao carregar praise: $error',
          onRetry: () {
            ref.invalidate(praiseProvider(praiseId));
          },
        ),
      ),
    );
  }

  IconData _getMaterialIcon(PraiseMaterialSimple material) {
    final typeName = (material.materialType?.name ?? '').toUpperCase();
    if (typeName.contains('FILE') || material.path.endsWith('.pdf')) {
      return Icons.insert_drive_file;
    } else if (typeName.contains('YOUTUBE') || material.path.contains('youtube.com')) {
      return Icons.play_circle;
    } else if (typeName.contains('SPOTIFY') || material.path.contains('spotify.com')) {
      return Icons.music_note;
    } else if (typeName.contains('TEXT')) {
      return Icons.text_fields;
    }
    return Icons.insert_drive_file;
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

  String _getReviewActionName(String type) {
    switch (type) {
      case 'in_review':
        return 'Revisão Iniciada';
      case 'review_cancelled':
        return 'Revisão Cancelada';
      case 'review_finished':
        return 'Revisão Finalizada';
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Este praise não possui materiais de arquivo para download'),
            duration: Duration(seconds: 3),
          ),
        );
      }
      return;
    }

    // Mostrar dialog de confirmação
    if (!context.mounted) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Baixar Praise em ZIP'),
        content: Text(
          'Será baixado um arquivo ZIP contendo ${fileMaterials.length} material(is) de arquivo do praise "${praise.name}".',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Baixar'),
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
      Navigator.of(context).pop(); // Fechar dialog de progresso

      if (errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erro ao baixar ZIP: $errorMessage'),
            duration: const Duration(seconds: 5),
          ),
        );
      } else if (filePath == null) {
        // Usuário cancelou a seleção de arquivo
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Download cancelado'),
            duration: Duration(seconds: 2),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('ZIP salvo em: $filePath'),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (!context.mounted) return;
      Navigator.of(context).pop(); // Fechar dialog de progresso
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao baixar ZIP: $e'),
          duration: const Duration(seconds: 5),
        ),
      );
    }
  }

  void _showDeleteDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmar Exclusão'),
        content: const Text('Tem certeza que deseja excluir este praise? Esta ação não pode ser desfeita.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _deletePraise(context, ref);
            },
            child: const Text('Excluir', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  Future<void> _deletePraise(BuildContext context, WidgetRef ref) async {
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deletePraise(praiseId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Praise excluído com sucesso')),
        );
        context.go('/praises');
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao excluir: $e')),
        );
      }
    }
  }

  void _showStartReviewDialog(BuildContext context, WidgetRef ref, String praiseId) {
    final descriptionController = TextEditingController();
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Iniciar Revisão'),
        content: TextField(
          controller: descriptionController,
          decoration: const InputDecoration(
            labelText: 'Descrição (opcional)',
            hintText: 'Descreva o motivo da revisão...',
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _startReview(context, ref, praiseId, descriptionController.text);
            },
            child: const Text('Iniciar'),
          ),
        ],
      ),
    );
  }

  Future<void> _startReview(BuildContext context, WidgetRef ref, String praiseId, String description) async {
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
          const SnackBar(content: Text('Revisão iniciada com sucesso')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao iniciar revisão: $e')),
        );
      }
    }
  }

  Future<void> _cancelReview(BuildContext context, WidgetRef ref, String praiseId) async {
    try {
      final apiService = ref.read(apiServiceProvider);
      final request = ReviewActionRequest(action: 'cancel');
      
      await apiService.reviewAction(praiseId, request);
      
      // Invalidar provider para atualizar UI
      ref.invalidate(praiseProvider(praiseId));
      
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Revisão cancelada com sucesso')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao cancelar revisão: $e')),
        );
      }
    }
  }

  Future<void> _finishReview(BuildContext context, WidgetRef ref, String praiseId) async {
    try {
      final apiService = ref.read(apiServiceProvider);
      final request = ReviewActionRequest(action: 'finish');
      
      await apiService.reviewAction(praiseId, request);
      
      // Invalidar provider para atualizar UI
      ref.invalidate(praiseProvider(praiseId));
      
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Revisão finalizada com sucesso')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao finalizar revisão: $e')),
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
          const Text('Baixando ZIP...'),
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
