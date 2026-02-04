import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_card.dart';
import '../widgets/app_button.dart';
import '../widgets/app_dialog.dart';
import '../providers/praise_list_providers.dart';
import '../models/praise_list_model.dart';

class PraiseListDetailPage extends ConsumerStatefulWidget {
  final String listId;

  const PraiseListDetailPage({
    super.key,
    required this.listId,
  });

  @override
  ConsumerState<PraiseListDetailPage> createState() => _PraiseListDetailPageState();
}

class _PraiseListDetailPageState extends ConsumerState<PraiseListDetailPage> {
  String? _removingPraiseId;
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _handleDelete() async {
    try {
      await ref.read(deletePraiseListProvider(widget.listId).future);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.successPraiseListDeleted)),
        );
        context.go('/praise-lists');
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppLocalizations.of(context)!.errorDeletePraiseList}: $error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handleFollow() async {
    try {
      await ref.read(followListProvider(widget.listId).future);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.successListFollowed)),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppLocalizations.of(context)!.errorFollowList}: $error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handleUnfollow() async {
    try {
      await ref.read(unfollowListProvider(widget.listId).future);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.successListUnfollowed)),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppLocalizations.of(context)!.errorUnfollowList}: $error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handleCopy() async {
    try {
      final newList = await ref.read(copyListProvider(widget.listId).future);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.successListCopied)),
        );
        context.go('/praise-lists/${newList.id}');
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppLocalizations.of(context)!.errorCopyList}: $error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handleRemovePraise(String praiseId) async {
    setState(() {
      _removingPraiseId = praiseId;
    });
    try {
      await ref.read(removePraiseFromListProvider((listId: widget.listId, praiseId: praiseId)).future);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.successPraiseRemovedFromList)),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppLocalizations.of(context)!.errorRemovePraiseFromList}: $error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _removingPraiseId = null;
        });
      }
    }
  }

  Future<void> _handleMovePraise(String praiseId, String direction) async {
    final listAsync = ref.read(praiseListByIdProvider(widget.listId));
    await listAsync.when(
      data: (list) async {
        final currentIndex = list.praises.indexWhere((p) => p.id == praiseId);
        if (currentIndex == -1) return;

        final newIndex = direction == 'up' ? currentIndex - 1 : currentIndex + 1;
        if (newIndex < 0 || newIndex >= list.praises.length) return;

        final praiseOrders = list.praises.asMap().entries.map((entry) {
          final index = entry.key;
          final praise = entry.value;
          if (index == currentIndex) {
            return PraiseOrder(praiseId: praise.id, order: newIndex);
          } else if (index == newIndex) {
            return PraiseOrder(praiseId: praise.id, order: currentIndex);
          }
          return PraiseOrder(praiseId: praise.id, order: index);
        }).toList();

        try {
          await ref.read(reorderPraisesInListProvider((listId: widget.listId, data: ReorderPraisesRequest(praiseOrders: praiseOrders))).future);
        } catch (error) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Erro ao reordenar: $error'),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      },
      loading: () async {},
      error: (_, __) async {},
    );
  }

  Future<void> _handleUpdateName() async {
    if (_nameController.text.trim().isEmpty) return;
    try {
      await ref.read(updatePraiseListProvider((id: widget.listId, data: PraiseListUpdate(name: _nameController.text.trim()))).future);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.successPraiseListUpdated)),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppLocalizations.of(context)!.errorUpdatePraiseList}: $error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final listAsync = ref.watch(praiseListByIdProvider(widget.listId));
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitlePraiseListDetail),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/praise-lists'),
        ),
      ),
      body: listAsync.when(
        data: (list) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header com nome e status
              Row(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            list.name,
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                        ),
                        Icon(
                          list.isPublic ? Icons.public : Icons.lock,
                          size: 24,
                          color: Colors.grey,
                        ),
                        if (list.isOwner) ...[
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.edit),
                            onPressed: () async {
                              _nameController.text = list.name;
                              final result = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: Text(l10n.pageTitlePraiseListEdit),
                                  content: TextField(
                                    controller: _nameController,
                                    decoration: InputDecoration(
                                      labelText: l10n.labelName,
                                      hintText: l10n.hintEnterListName,
                                    ),
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.of(context).pop(false),
                                      child: Text(l10n.buttonCancel),
                                    ),
                                    TextButton(
                                      onPressed: () => Navigator.of(context).pop(true),
                                      child: Text(l10n.buttonSave),
                                    ),
                                  ],
                                ),
                              );
                              if (result == true) {
                                _handleUpdateName();
                              }
                            },
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Descrição
              if (list.description != null && list.description!.isNotEmpty) ...[
                AppCard(
                  child: Text(
                    list.description!,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Informações adicionais
              Row(
                children: [
                  if (list.owner != null) ...[
                    Text(
                      '${l10n.labelBy} ${list.owner}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(width: 16),
                  ],
                  Text(
                    l10n.labelPraisesCount(list.praisesCount),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Botões de ação
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (list.isOwner) ...[
                    AppButton(
                      text: l10n.buttonDelete,
                      icon: Icons.delete,
                      onPressed: () async {
                        final confirmed = await AppDialog.showConfirm(
                          context: context,
                          title: l10n.dialogTitleConfirmDelete,
                          message: l10n.dialogMessageDeletePraiseList,
                          confirmText: l10n.buttonConfirm,
                          cancelText: l10n.buttonCancel,
                          confirmColor: Colors.red,
                        );
                        if (confirmed == true) {
                          _handleDelete();
                        }
                      },
                      backgroundColor: Colors.red,
                    ),
                  ] else ...[
                    if (list.isFollowing)
                      AppButton(
                        text: l10n.actionUnfollow,
                        icon: Icons.person_remove,
                        onPressed: _handleUnfollow,
                      )
                    else
                      AppButton(
                        text: l10n.actionFollow,
                        icon: Icons.person_add,
                        onPressed: _handleFollow,
                      ),
                    AppButton(
                      text: l10n.actionCopyList,
                      icon: Icons.copy,
                      onPressed: _handleCopy,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 24),

              // Lista de praises
              Text(
                '${l10n.pageTitlePraises} (${list.praises.length})',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              if (list.praises.isEmpty)
                AppEmptyWidget(
                  message: l10n.messageNoPraisesInList,
                  icon: Icons.music_note,
                )
              else
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: list.praises.length,
                  itemBuilder: (context, index) {
                    final praise = list.praises[index];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AppCard(
                        child: Row(
                          children: [
                            if (list.isOwner) ...[
                              Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.arrow_upward),
                                    onPressed: index == 0
                                        ? null
                                        : () => _handleMovePraise(praise.id, 'up'),
                                    tooltip: l10n.actionMoveUp,
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.arrow_downward),
                                    onPressed: index == list.praises.length - 1
                                        ? null
                                        : () => _handleMovePraise(praise.id, 'down'),
                                    tooltip: l10n.actionMoveDown,
                                  ),
                                ],
                              ),
                              const SizedBox(width: 8),
                            ],
                            Text(
                              '${praise.order + 1}.',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: InkWell(
                                onTap: () {
                                  context.push('/praises/${praise.id}');
                                },
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      praise.name,
                                      style: Theme.of(context).textTheme.titleMedium,
                                    ),
                                    if (praise.number != null)
                                      Text(
                                        l10n.badgeNumber(praise.number!),
                                        style: Theme.of(context).textTheme.bodySmall,
                                      ),
                                  ],
                                ),
                              ),
                            ),
                            if (list.isOwner)
                              IconButton(
                                icon: _removingPraiseId == praise.id
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      )
                                    : const Icon(Icons.delete, color: Colors.red),
                                onPressed: _removingPraiseId == praise.id
                                    ? null
                                    : () => _handleRemovePraise(praise.id),
                                tooltip: l10n.actionRemoveFromList,
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
            ],
          ),
        ),
        loading: () => const AppLoadingIndicator(message: 'Carregando lista...'),
        error: (error, stack) => AppErrorWidget(
          message: '${l10n.errorLoadPraiseList}: $error',
          onRetry: () {
            ref.invalidate(praiseListByIdProvider(widget.listId));
          },
        ),
      ),
    );
  }
}
