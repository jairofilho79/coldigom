import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/app_dialog.dart';
import '../services/api/api_service.dart';
import '../providers/material_providers.dart';
import '../models/material_kind_model.dart';

class MaterialKindListPage extends ConsumerWidget {
  const MaterialKindListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final materialKindsAsync = ref.watch(materialKindsProvider);
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleMaterialKinds),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              context.push('/material-kinds/create');
            },
          ),
        ],
      ),
      body: materialKindsAsync.when(
        data: (materialKinds) {
          if (materialKinds.isEmpty) {
            return AppEmptyWidget(
              message: l10n.messageNoMaterialKindsAvailable,
              icon: Icons.folder_outlined,
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: materialKinds.length,
            itemBuilder: (context, index) {
              final materialKind = materialKinds[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AppCard(
                  child: ListTile(
                    leading: const Icon(Icons.folder),
                    title: Text(getMaterialKindName(ref, materialKind.id, materialKind.name)),
                    subtitle: Text(l10n.messageId.replaceAll('{id}', materialKind.id)),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit),
                          onPressed: () {
                            context.push('/material-kinds/${materialKind.id}/edit');
                          },
                          tooltip: l10n.tooltipEdit,
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          onPressed: () => _showDeleteDialog(context, ref, materialKind),
                          tooltip: l10n.tooltipDelete,
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
          message: 'Erro ao carregar material kinds: $error',
          onRetry: () {
            ref.invalidate(materialKindsProvider);
          },
        ),
      ),
    );
  }

  Future<void> _showDeleteDialog(BuildContext context, WidgetRef ref, MaterialKindResponse materialKind) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: l10n.dialogTitleConfirmDelete,
      message: l10n.dialogMessageDeleteMaterialKind,
      confirmText: l10n.buttonDelete,
    );

    if (confirmed == true) {
      await _deleteMaterialKind(context, ref, materialKind.id);
    }
  }

  Future<void> _deleteMaterialKind(BuildContext context, WidgetRef ref, String kindId) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deleteMaterialKind(kindId);

      // Invalidar provider para atualizar lista
      ref.invalidate(materialKindsProvider);

      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.successMaterialKindDeleted)),
      );
    } catch (e) {
      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.errorDeleteMaterialKind.replaceAll('{error}', e.toString()))),
      );
    }
  }
}
