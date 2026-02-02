import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/praise_material_model.dart';
import '../models/praise_model.dart';
import '../services/api/api_service.dart';
import '../widgets/app_card.dart';
import '../widgets/app_button.dart';
import '../widgets/app_status_widgets.dart';
import 'material_form_dialog.dart';
import '../pages/praise_detail_page.dart';

/// Widget para gerenciar lista de materiais
class MaterialManagerWidget extends ConsumerStatefulWidget {
  final String praiseId;
  final List<dynamic> materials; // Aceita tanto PraiseMaterialSimple quanto PraiseMaterialResponse
  final bool isEditMode; // Se true, materiais já existem e podem ser editados/deletados
  final Function(List<PraiseMaterialResponse>)? onMaterialsChanged;

  const MaterialManagerWidget({
    super.key,
    required this.praiseId,
    required this.materials,
    this.isEditMode = false,
    this.onMaterialsChanged,
  });

  @override
  ConsumerState<MaterialManagerWidget> createState() => _MaterialManagerWidgetState();
}

class _MaterialManagerWidgetState extends ConsumerState<MaterialManagerWidget> {
  List<PraiseMaterialResponse> _materials = [];
  bool _showOldMaterials = false;

  @override
  void initState() {
    super.initState();
    _loadMaterials();
  }

  @override
  void didUpdateWidget(MaterialManagerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.materials != oldWidget.materials || widget.praiseId != oldWidget.praiseId) {
      _loadMaterials();
    }
  }

  Future<void> _loadMaterials() async {
    // Se tiver praiseId, sempre carregar da API (tanto em modo edição quanto visualização)
    if (widget.praiseId.isNotEmpty) {
      try {
        final apiService = ref.read(apiServiceProvider);
        final materials = await apiService.getMaterials(
          praiseId: widget.praiseId,
          isOld: _showOldMaterials ? null : false,
        );
        setState(() {
          _materials = materials;
        });
        widget.onMaterialsChanged?.call(_materials);
      } catch (e) {
        // Se falhar, tentar converter a lista fornecida
        _convertMaterials();
        // Filtrar localmente se não estiver em modo edição
        if (!_showOldMaterials) {
          setState(() {
            _materials = _materials.where((m) => m.isOld != true).toList();
          });
        }
      }
    } else {
      _convertMaterials();
      // Filtrar localmente se não estiver em modo edição
      if (!_showOldMaterials) {
        setState(() {
          _materials = _materials.where((m) => m.isOld != true).toList();
        });
      }
    }
  }

  void _convertMaterials() {
    // Converter PraiseMaterialSimple para PraiseMaterialResponse se necessário
    _materials = widget.materials.map((m) {
      if (m is PraiseMaterialResponse) {
        return m;
      } else if (m is PraiseMaterialSimple) {
        // Converter Simple para Response
        return PraiseMaterialResponse(
          id: m.id,
          materialKindId: m.materialKindId,
          materialTypeId: m.materialTypeId,
          praiseId: widget.praiseId,
          path: m.path,
          isOld: m.isOld,
          oldDescription: m.oldDescription,
          materialKind: m.materialKind,
          materialType: m.materialType,
        );
      }
      throw Exception('Tipo de material não suportado: ${m.runtimeType}');
    }).toList().cast<PraiseMaterialResponse>();
  }

  IconData _getMaterialIcon(dynamic material) {
    final typeName = (material.materialType?.name ?? '').toUpperCase();
    final path = material.path ?? '';
    if (typeName.contains('FILE') || path.endsWith('.pdf')) {
      return Icons.insert_drive_file;
    } else if (typeName.contains('YOUTUBE') || path.contains('youtube.com')) {
      return Icons.play_circle;
    } else if (typeName.contains('SPOTIFY') || path.contains('spotify.com')) {
      return Icons.music_note;
    } else if (typeName.contains('TEXT')) {
      return Icons.text_fields;
    }
    return Icons.insert_drive_file;
  }

  Color _getMaterialIconColor(dynamic material) {
    final typeName = (material.materialType?.name ?? '').toUpperCase();
    if (typeName.contains('FILE')) {
      return Colors.red;
    } else if (typeName.contains('YOUTUBE')) {
      return Colors.red;
    } else if (typeName.contains('SPOTIFY')) {
      return Colors.green;
    } else if (typeName.contains('TEXT')) {
      return Colors.blue;
    }
    return Colors.grey;
  }

  Future<void> _addMaterial() async {
    if (widget.praiseId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('É necessário criar o praise primeiro')),
      );
      return;
    }

    final result = await showDialog<bool>(
      context: context,
      builder: (context) => MaterialFormDialog(
        praiseId: widget.praiseId,
      ),
    );

    if (result == true && widget.isEditMode) {
      // Recarregar materiais se estiver em modo edição
      await _refreshMaterials();
      // Invalidar provider do praise para atualizar a página
      ref.invalidate(praiseProvider(widget.praiseId));
    }
  }

  Future<void> _editMaterial(PraiseMaterialResponse material) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => MaterialFormDialog(
        praiseId: widget.praiseId,
        material: material,
      ),
    );

    if (result == true && widget.isEditMode) {
      // Recarregar materiais se estiver em modo edição
      await _refreshMaterials();
      // Invalidar provider do praise para atualizar a página
      ref.invalidate(praiseProvider(widget.praiseId));
    }
  }

  Future<void> _deleteMaterial(PraiseMaterialResponse material) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmar Exclusão'),
        content: Text('Tem certeza que deseja excluir este material?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        final apiService = ref.read(apiServiceProvider);
        await apiService.deleteMaterial(material.id);
        
        if (widget.isEditMode) {
          await _refreshMaterials();
          // Invalidar provider do praise para atualizar a página
          ref.invalidate(praiseProvider(widget.praiseId));
        } else {
          // Remover da lista local
          setState(() {
            _materials.removeWhere((m) => m.id == material.id);
          });
          widget.onMaterialsChanged?.call(_materials);
        }

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Material excluído com sucesso')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Erro ao excluir material: $e')),
          );
        }
      }
    }
  }

  Future<void> _refreshMaterials() async {
    if (widget.praiseId.isEmpty) {
      _loadMaterials();
      return;
    }
    try {
      final apiService = ref.read(apiServiceProvider);
      final materials = await apiService.getMaterials(
        praiseId: widget.praiseId,
        isOld: _showOldMaterials ? null : false,
      );
      setState(() {
        _materials = materials;
      });
      widget.onMaterialsChanged?.call(_materials);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao carregar materiais: $e')),
        );
      }
    }
  }

  void _toggleShowOldMaterials() {
    setState(() {
      _showOldMaterials = !_showOldMaterials;
    });
    _loadMaterials();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Materiais (${_materials.length})',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            AppButton(
              text: _showOldMaterials ? 'Ocultar Antigos' : 'Ver Antigos',
              icon: Icons.history,
              onPressed: _toggleShowOldMaterials,
            ),
            const SizedBox(width: 8),
            AppButton(
              text: 'Adicionar',
              icon: Icons.add,
              onPressed: _addMaterial,
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_materials.isEmpty)
          const AppEmptyWidget(
            message: 'Nenhum material cadastrado',
            icon: Icons.insert_drive_file,
          )
        else
          ..._materials.map((material) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AppCard(
                  onTap: widget.isEditMode ? null : () {
                    final typeName = (material.materialType?.name ?? '').toLowerCase();
                    final path = material.path.toLowerCase();
                    
                    final isPdf = typeName == 'pdf' || 
                                  typeName.contains('file') && path.endsWith('.pdf');
                    final isAudio = typeName == 'audio' ||
                                   ['.mp3', '.wav', '.m4a', '.wma', '.aac', '.ogg']
                                       .any((ext) => path.endsWith(ext));
                    
                    if (isPdf) {
                      context.push(
                        '/materials/${material.id}/view?praiseName=${Uri.encodeComponent('')}&materialKindName=${Uri.encodeComponent(material.materialKind?.name ?? '')}',
                      );
                    } else if (isAudio) {
                      context.push(
                        '/materials/${material.id}/audio?praiseName=${Uri.encodeComponent('')}&materialKindName=${Uri.encodeComponent(material.materialKind?.name ?? '')}',
                      );
                    }
                  },
                  child: ListTile(
                    leading: Icon(
                      _getMaterialIcon(material),
                      color: _getMaterialIconColor(material),
                    ),
                    title: Text(
                      material.materialKind?.name ?? material.materialKindId,
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          material.materialType?.name ?? material.materialTypeId,
                        ),
                        if (material.isOld == true) ...[
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(
                                Icons.warning,
                                size: 16,
                                color: Colors.orange,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  'Material Antigo',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(color: Colors.orange),
                                ),
                              ),
                            ],
                          ),
                          if (material.oldDescription != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              material.oldDescription!,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ],
                      ],
                    ),
                    trailing: widget.isEditMode
                        ? Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit),
                                onPressed: () => _editMaterial(material),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete),
                                color: Colors.red,
                                onPressed: () => _deleteMaterial(material),
                              ),
                            ],
                          )
                        : null,
                  ),
                ),
              )),
      ],
    );
  }
}
