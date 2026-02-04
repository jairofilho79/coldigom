import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../providers/praise_list_providers.dart';
import '../models/praise_list_model.dart';
import 'app_button.dart';

/// Widget para adicionar um praise a uma lista
class AddToListButton extends ConsumerWidget {
  final String praiseId;
  final VoidCallback? onAdded;

  const AddToListButton({
    super.key,
    required this.praiseId,
    this.onAdded,
  });

  Future<void> _handleAddToList(WidgetRef ref, BuildContext context, String listId) async {
    try {
      await ref.read(addPraiseToListProvider((listId: listId, praiseId: praiseId)).future);
      if (context.mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.successPraiseAddedToList)),
        );
        onAdded?.call();
      }
    } catch (error) {
      if (context.mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${l10n.errorAddPraiseToList}: $error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  bool _isPraiseInList(PraiseListDetailResponse list, String praiseId) {
    return list.praises.any((p) => p.id == praiseId);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filters = PraiseListQueryParams();
    final listsAsync = ref.watch(praiseListsProvider(filters));
    final l10n = AppLocalizations.of(context)!;

    return listsAsync.when(
      data: (lists) {
        if (lists.isEmpty) {
          return const SizedBox.shrink();
        }

        return PopupMenuButton<String>(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.list),
              const SizedBox(width: 4),
              Text(l10n.actionAddToList),
              const Icon(Icons.arrow_drop_down),
            ],
          ),
          itemBuilder: (context) {
            if (lists.isEmpty) {
              return [
                PopupMenuItem(
                  enabled: false,
                  child: Text(l10n.messageNoLists),
                ),
              ];
            }

            return lists.map((list) {
              return PopupMenuItem<String>(
                value: list.id,
                child: Row(
                  children: [
                    const Icon(Icons.list, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        list.name,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (list.praisesCount > 0)
                      Text(
                        '(${list.praisesCount})',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                  ],
                ),
              );
            }).toList();
          },
          onSelected: (listId) {
            _handleAddToList(ref, context, listId);
          },
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}
