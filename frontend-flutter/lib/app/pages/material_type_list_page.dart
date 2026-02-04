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
import '../models/material_type_model.dart';

class MaterialTypeListPage extends ConsumerWidget {
  const MaterialTypeListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final materialTypesAsync = ref.watch(materialTypesProvider);
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleMaterialTypes),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              context.push('/material-types/create');
            },
          ),
        ],
      ),
      body: materialTypesAsync.when(
        data: (materialTypes) {
          if (materialTypes.isEmpty) {
            return AppEmptyWidget(
              message: 'Nenhum material type encontrado',
              icon: Icons.category_outlined,
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: materialTypes.length,
            itemBuilder: (context, index) {
              final materialType = materialTypes[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AppCard(
                  child: ListTile(
                    leading: const Icon(Icons.category),
                    title: Text(getMaterialTypeName(ref, materialType.id, materialType.name)),
                    subtitle: Text(l10n.messageId(materialType.id)),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit),
                          onPressed: () {
                            context.push('/material-types/${materialType.id}/edit');
                          },
                          tooltip: l10n.tooltipEdit,
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          onPressed: () => _showDeleteDialog(context, ref, materialType),
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
          message: 'Erro ao carregar material types: $error',
          onRetry: () {
            ref.invalidate(materialTypesProvider);
          },
        ),
      ),
    );
  }

  Future<void> _showDeleteDialog(BuildContext context, WidgetRef ref, MaterialTypeResponse materialType) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: l10n.dialogTitleConfirmDelete,
      message: l10n.dialogMessageDeleteMaterialType,
      confirmText: l10n.buttonDelete,
    );

    if (confirmed == true) {
      await _deleteMaterialType(context, ref, materialType.id);
    }
  }

  Future<void> _deleteMaterialType(BuildContext context, WidgetRef ref, String typeId) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deleteMaterialType(typeId);

      // Invalidar provider para atualizar lista
      ref.invalidate(materialTypesProvider);

      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.successMaterialTypeDeleted)),
      );
    } catch (e) {
      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.errorDeleteMaterialType(e.toString()))),
      );
    }
  }
}
