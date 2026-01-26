import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_dialog.dart';
import '../services/api/api_service.dart';
import '../models/praise_tag_model.dart';

/// Provider para lista de tags
final tagsProvider = FutureProvider.family<List<PraiseTagResponse>, Map<String, dynamic>>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getTags(
      skip: params['skip'] as int?,
      limit: params['limit'] as int?,
    );
  },
);

class TagListPage extends ConsumerWidget {
  const TagListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tagsAsync = ref.watch(tagsProvider({'skip': 0, 'limit': 1000}));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tags'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              context.push('/tags/create');
            },
          ),
        ],
      ),
      body: tagsAsync.when(
        data: (tags) {
          if (tags.isEmpty) {
            return const AppEmptyWidget(
              message: 'Nenhuma tag encontrada',
              icon: Icons.label,
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: tags.length,
            itemBuilder: (context, index) {
              final tag = tags[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AppCard(
                  child: ListTile(
                    title: Text(tag.name),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit),
                          onPressed: () {
                            context.push('/tags/${tag.id}/edit');
                          },
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          onPressed: () => _showDeleteDialog(context, ref, tag),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
        loading: () => const AppLoadingIndicator(message: 'Carregando tags...'),
        error: (error, stack) => AppErrorWidget(
          message: 'Erro ao carregar tags: $error',
          onRetry: () {
            ref.invalidate(tagsProvider({'skip': 0, 'limit': 1000}));
          },
        ),
      ),
    );
  }

  Future<void> _showDeleteDialog(BuildContext context, WidgetRef ref, PraiseTagResponse tag) async {
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: 'Confirmar Exclusão',
      message: 'Tem certeza que deseja excluir a tag "${tag.name}"? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
    );

    if (confirmed == true) {
      await _deleteTag(context, ref, tag.id);
    }
  }

  Future<void> _deleteTag(BuildContext context, WidgetRef ref, String tagId) async {
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deleteTag(tagId);

      // Invalidar provider para atualizar lista
      ref.invalidate(tagsProvider({'skip': 0, 'limit': 1000}));

      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Tag excluída com sucesso')),
      );
    } catch (e) {
      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao excluir tag: $e')),
      );
    }
  }
}
