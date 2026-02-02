import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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

    return AppScaffold(
      appBar: AppBar(
        title: const Text('Material Types'),
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
            return const AppEmptyWidget(
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
                    title: Text(materialType.name),
                    subtitle: Text('ID: ${materialType.id}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit),
                          onPressed: () {
                            context.push('/material-types/${materialType.id}/edit');
                          },
                          tooltip: 'Editar',
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          onPressed: () => _showDeleteDialog(context, ref, materialType),
                          tooltip: 'Excluir',
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
        loading: () => const AppLoadingIndicator(message: 'Carregando material types...'),
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
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: 'Confirmar Exclusão',
      message: 'Tem certeza que deseja excluir o material type "${materialType.name}"? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
    );

    if (confirmed == true) {
      await _deleteMaterialType(context, ref, materialType.id);
    }
  }

  Future<void> _deleteMaterialType(BuildContext context, WidgetRef ref, String typeId) async {
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deleteMaterialType(typeId);

      // Invalidar provider para atualizar lista
      ref.invalidate(materialTypesProvider);

      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Material type excluído com sucesso')),
      );
    } catch (e) {
      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao excluir material type: $e')),
      );
    }
  }
}
