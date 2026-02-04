import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_dialog.dart';
import '../widgets/app_scaffold.dart';
import '../services/api/api_service.dart';
import '../models/praise_tag_model.dart';

/// Provider para lista de tags
final tagsProvider = FutureProvider<List<PraiseTagResponse>>(
  (ref) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getTags(
      skip: 0,
      limit: 1000,
    );
  },
);

class TagListPage extends ConsumerWidget {
  const TagListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tagsAsync = ref.watch(tagsProvider);
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleTags),
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
            return AppEmptyWidget(
              message: l10n.messageNoTagsAvailable,
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
                    title: Text(getPraiseTagName(ref, tag.id, tag.name)),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ActionChip(
                          avatar: const Icon(Icons.filter_list, size: 18),
                          label: Text(l10n.actionFilter),
                          tooltip: 'Filtrar praises por esta tag',
                          onPressed: () {
                            context.push('/praises?tagId=${tag.id}');
                          },
                        ),
                        const SizedBox(width: 8),
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
        loading: () => AppLoadingIndicator(message: l10n.statusLoading),
        error: (error, stack) => AppErrorWidget(
          message: 'Erro ao carregar tags: $error',
          onRetry: () {
            ref.invalidate(tagsProvider);
          },
        ),
      ),
    );
  }

  Future<void> _showDeleteDialog(BuildContext context, WidgetRef ref, PraiseTagResponse tag) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: l10n.dialogTitleConfirmDelete,
      message: l10n.dialogMessageDeleteTag,
      confirmText: l10n.buttonDelete,
    );

    if (confirmed == true) {
      await _deleteTag(context, ref, tag.id);
    }
  }

  Future<void> _deleteTag(BuildContext context, WidgetRef ref, String tagId) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deleteTag(tagId);

      // Invalidar provider para atualizar lista
      ref.invalidate(tagsProvider);

      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.successTagDeleted)),
      );
    } catch (e) {
      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.errorDeleteTag(e.toString()))),
      );
    }
  }
}
