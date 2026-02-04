import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../providers/room_providers.dart';
import '../pages/praise_detail_page.dart'; // Para importar praiseProvider

class RoomMaterialSelectorDialog extends ConsumerStatefulWidget {
  final String praiseId;

  const RoomMaterialSelectorDialog({
    super.key,
    required this.praiseId,
  });

  @override
  ConsumerState<RoomMaterialSelectorDialog> createState() => _RoomMaterialSelectorDialogState();
}

class _RoomMaterialSelectorDialogState extends ConsumerState<RoomMaterialSelectorDialog> {
  final Set<String> _selectedMaterialIds = {};

  @override
  Widget build(BuildContext context) {
    final praiseAsync = ref.watch(praiseProvider(widget.praiseId));

    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        height: MediaQuery.of(context).size.height * 0.8,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Selecionar Materiais',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const Divider(),
            Expanded(
              child: praiseAsync.when(
                data: (praise) {
                  // Filtrar apenas PDFs e textos
                  final pdfAndTextMaterials = praise.materials.where((material) {
                    final typeName = material.materialType?.name.toLowerCase() ?? '';
                    return typeName == 'pdf' || typeName == 'text';
                  }).toList();

                  if (pdfAndTextMaterials.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.info_outline,
                            size: 64,
                            color: Colors.grey,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Nenhum material PDF ou texto disponível',
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                        ],
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: pdfAndTextMaterials.length,
                    itemBuilder: (context, index) {
                      final material = pdfAndTextMaterials[index];
                      final isSelected = _selectedMaterialIds.contains(material.id);
                      final isPdf = (material.materialType?.name.toLowerCase() ?? '') == 'pdf';
                      final icon = isPdf ? Icons.picture_as_pdf : Icons.text_fields;
                      final color = isPdf ? Colors.red : Colors.blue;

                      // Obter nome traduzido do material kind
                      final materialKindName = material.materialKind != null
                          ? getMaterialKindName(
                              ref,
                              material.materialKind!.id,
                              material.materialKind!.name,
                            )
                          : 'Material';

                      return CheckboxListTile(
                        value: isSelected,
                        onChanged: (value) {
                          setState(() {
                            if (value == true) {
                              _selectedMaterialIds.add(material.id);
                            } else {
                              _selectedMaterialIds.remove(material.id);
                            }
                          });
                        },
                        title: Text(
                          materialKindName,
                          style: TextStyle(
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          ),
                        ),
                        subtitle: Text(
                          material.materialType?.name ?? '',
                        ),
                        secondary: Icon(icon, color: color),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, stack) => Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text('Erro ao carregar materiais: $error'),
                    ],
                  ),
                ),
              ),
            ),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancelar'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _selectedMaterialIds.isEmpty
                      ? null
                      : () => _addMaterialsToPlaylist(context, ref),
                  child: Text('Adicionar (${_selectedMaterialIds.length})'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addMaterialsToPlaylist(BuildContext context, WidgetRef ref) async {
    final praiseAsync = ref.read(praiseProvider(widget.praiseId));
    
    await praiseAsync.when(
      data: (praise) async {
        final notifier = ref.read(currentRoomOfflineStateProvider.notifier);
        
        for (final materialId in _selectedMaterialIds) {
          final material = praise.materials.firstWhere((m) => m.id == materialId);
          final materialKindId = material.materialKind?.id;
          final materialKindName = material.materialKind?.name ?? 'Material';
          final materialTypeName = material.materialType?.name ?? '';
          
          await notifier.addMaterialToPlaylist(
            materialId: materialId,
            praiseId: widget.praiseId,
            praiseName: praise.name,
            materialKindId: materialKindId,
            materialKindName: materialKindName,
            materialTypeName: materialTypeName,
          );
        }
      },
      loading: () async {},
      error: (_, __) async {},
    );

    if (context.mounted) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${_selectedMaterialIds.length} material(is) adicionado(s) à playlist'),
        ),
      );
    }
  }
}
