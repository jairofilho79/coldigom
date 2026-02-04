import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../../core/i18n/entity_translation_providers.dart';
import '../models/praise_material_model.dart';
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

  /// Retorna o ícone apropriado para o tipo de material
  IconData _getMaterialTypeIcon(dynamic material) {
    final typeName = (material.materialType?.name ?? '').toUpperCase();
    final path = (material.path ?? '').toLowerCase();
    
    // PDF
    if (typeName.contains('PDF') || typeName.contains('FILE') || path.endsWith('.pdf')) {
      return Icons.picture_as_pdf;
    }
    // Audio
    if (typeName.contains('AUDIO') || 
        ['.mp3', '.wav', '.m4a', '.wma', '.aac', '.ogg', '.flac'].any((ext) => path.endsWith(ext))) {
      return Icons.audiotrack;
    }
    // Youtube
    if (typeName.contains('YOUTUBE') || path.contains('youtube.com') || path.contains('youtu.be')) {
      return Icons.play_circle;
    }
    // Text
    if (typeName.contains('TEXT')) {
      return Icons.text_fields;
    }
    // Spotify
    if (typeName.contains('SPOTIFY') || path.contains('spotify.com')) {
      return Icons.music_note;
    }
    // Default
    return Icons.insert_drive_file;
  }

  /// Retorna a cor apropriada para o tipo de material
  Color _getMaterialTypeColor(dynamic material) {
    final typeName = (material.materialType?.name ?? '').toUpperCase();
    final path = (material.path ?? '').toLowerCase();
    
    // PDF - branco
    if (typeName.contains('PDF') || typeName.contains('FILE') || path.endsWith('.pdf')) {
      return Colors.white;
    }
    // Audio - laranja/amarelo
    if (typeName.contains('AUDIO') || 
        ['.mp3', '.wav', '.m4a', '.wma', '.aac', '.ogg', '.flac'].any((ext) => path.endsWith(ext))) {
      return Colors.orange;
    }
    // Youtube - vermelho (mas o ícone será customizado)
    if (typeName.contains('YOUTUBE') || path.contains('youtube.com') || path.contains('youtu.be')) {
      return Colors.red;
    }
    // Text - azul
    if (typeName.contains('TEXT')) {
      return Colors.blue;
    }
    // Spotify - verde
    if (typeName.contains('SPOTIFY') || path.contains('spotify.com')) {
      return Colors.green;
    }
    // Default - cinza
    return Colors.grey;
  }

  /// Verifica se o material é do tipo YouTube
  bool _isYouTube(dynamic material) {
    final typeName = (material.materialType?.name ?? '').toUpperCase();
    final path = (material.path ?? '').toLowerCase();
    return typeName.contains('YOUTUBE') || path.contains('youtube.com') || path.contains('youtu.be');
  }

  /// Widget customizado para o ícone do YouTube (logo oficial baseado no SVG)
  Widget _buildYouTubeIcon() {
    // SVG do YouTube com fundo vermelho e play branco
    const youtubeSvg = '''
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect width="16" height="16" rx="3" fill="#FF0000"/>
  <path d="M6.4 5.209v4.818l4.157-2.408z" fill="white"/>
</svg>
''';
    
    return SizedBox(
      width: 24,
      height: 24,
      child: SvgPicture.string(
        youtubeSvg,
        fit: BoxFit.contain,
      ),
    );
  }

  /// Retorna a prioridade de ordenação do tipo de material
  /// Menor número = maior prioridade
  int _getMaterialTypePriority(dynamic material) {
    final typeName = (material.materialType?.name ?? '').toUpperCase();
    final path = (material.path ?? '').toLowerCase();
    
    // PDF primeiro (prioridade 1)
    if (typeName.contains('PDF') || typeName.contains('FILE') || path.endsWith('.pdf')) {
      return 1;
    }
    // Audio segundo (prioridade 2)
    if (typeName.contains('AUDIO') || 
        ['.mp3', '.wav', '.m4a', '.wma', '.aac', '.ogg', '.flac'].any((ext) => path.endsWith(ext))) {
      return 2;
    }
    // Text terceiro (prioridade 3)
    if (typeName.contains('TEXT')) {
      return 3;
    }
    // Youtube quarto (prioridade 4)
    if (typeName.contains('YOUTUBE') || path.contains('youtube.com') || path.contains('youtu.be')) {
      return 4;
    }
    // Outros por último (prioridade 5)
    return 5;
  }

  Future<void> _addMaterial() async {
    final l10n = AppLocalizations.of(context);
    if (widget.praiseId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.messageCreatePraiseFirst)),
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
    final l10n = AppLocalizations.of(context);
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.dialogTitleConfirmDelete),
        content: Text(l10n.dialogMessageDeleteMaterial),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.buttonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: Text(l10n.buttonDelete),
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
            SnackBar(content: Text(l10n.successMaterialDeleted)),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.errorDeleteMaterial(e.toString()))),
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

  /// Ordena os materiais: PDF primeiro, depois Audio, depois Text, depois Youtube, depois outros alfabeticamente
  /// Dentro de cada categoria, ordena por tradução do material kind
  List<PraiseMaterialResponse> _sortMaterials() {
    // Garantir que as traduções estejam carregadas
    ref.watch(materialKindTranslationsProvider);
    ref.watch(materialTypeTranslationsProvider);
    
    final sorted = List<PraiseMaterialResponse>.from(_materials);
    
    sorted.sort((a, b) {
      // Primeiro, ordenar por prioridade do tipo
      final priorityA = _getMaterialTypePriority(a);
      final priorityB = _getMaterialTypePriority(b);
      
      if (priorityA != priorityB) {
        return priorityA.compareTo(priorityB);
      }
      
      // Se a prioridade for a mesma (categoria "outros"), ordenar por tradução do tipo
      if (priorityA == 5) {
        final typeNameA = a.materialType != null
            ? getMaterialTypeName(ref, a.materialType!.id, a.materialType!.name)
            : a.materialTypeId;
        final typeNameB = b.materialType != null
            ? getMaterialTypeName(ref, b.materialType!.id, b.materialType!.name)
            : b.materialTypeId;
        
        final typeCompare = typeNameA.compareTo(typeNameB);
        if (typeCompare != 0) {
          return typeCompare;
        }
      }
      
      // Por fim, ordenar por tradução do material kind
      final kindNameA = a.materialKind != null
          ? getMaterialKindName(ref, a.materialKind!.id, a.materialKind!.name)
          : a.materialKindId;
      final kindNameB = b.materialKind != null
          ? getMaterialKindName(ref, b.materialKind!.id, b.materialKind!.name)
          : b.materialKindId;
      
      return kindNameA.compareTo(kindNameB);
    });
    
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    // Garantir que as traduções sejam carregadas antes de ordenar
    ref.watch(materialKindTranslationsProvider);
    ref.watch(materialTypeTranslationsProvider);
    
    final sortedMaterials = _sortMaterials();
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '${l10n.sectionMaterials} (${_materials.length})',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            AppButton(
              text: _showOldMaterials ? l10n.actionHideOldMaterials : l10n.actionViewOldMaterials,
              icon: Icons.history,
              onPressed: _toggleShowOldMaterials,
            ),
            const SizedBox(width: 8),
            AppButton(
              text: l10n.actionAddMaterial,
              icon: Icons.add,
              onPressed: _addMaterial,
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_materials.isEmpty)
          AppEmptyWidget(
            message: l10n.messageNoMaterials,
            icon: Icons.insert_drive_file,
          )
        else
          ...sortedMaterials.map((material) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AppCard(
                  onTap: widget.isEditMode ? null : () async {
                    final typeName = (material.materialType?.name ?? '').toLowerCase();
                    final path = material.path.toLowerCase();
                    
                    final isPdf = typeName == 'pdf' || 
                                  typeName.contains('file') && path.endsWith('.pdf');
                    final isAudio = typeName == 'audio' ||
                                   ['.mp3', '.wav', '.m4a', '.wma', '.aac', '.ogg']
                                       .any((ext) => path.endsWith(ext));
                    final isYouTube = _isYouTube(material);
                    
                    if (isPdf) {
                      context.push(
                        '/materials/${material.id}/view?praiseName=${Uri.encodeComponent('')}&materialKindName=${Uri.encodeComponent(material.materialKind?.name ?? '')}',
                      );
                    } else if (isAudio) {
                      context.push(
                        '/materials/${material.id}/audio?praiseName=${Uri.encodeComponent('')}&materialKindName=${Uri.encodeComponent(material.materialKind?.name ?? '')}',
                      );
                    } else if (isYouTube && material.path.isNotEmpty) {
                      // Abrir URL do YouTube no navegador/aplicativo
                      final uri = Uri.parse(material.path);
                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri, mode: LaunchMode.externalApplication);
                      } else {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Não foi possível abrir a URL do YouTube'),
                            ),
                          );
                        }
                      }
                    }
                  },
                  child: ListTile(
                    leading: _isYouTube(material)
                        ? _buildYouTubeIcon()
                        : Icon(
                            _getMaterialTypeIcon(material),
                            color: _getMaterialTypeColor(material),
                          ),
                    title: Text(
                      material.materialKind != null
                          ? getMaterialKindName(ref, material.materialKind!.id, material.materialKind!.name)
                          : material.materialKindId,
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
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
                                child: Builder(
                                  builder: (context) {
                                    final l10n = AppLocalizations.of(context);
                                    return Text(
                                      l10n.labelMaterialIsOld,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(color: Colors.orange),
                                    );
                                  },
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

