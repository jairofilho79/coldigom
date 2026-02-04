import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/extensions/material_form_type_extension.dart';
import '../models/praise_material_model.dart';
import '../models/material_kind_model.dart';
import '../models/material_type_model.dart';
import '../services/api/api_service.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_button.dart';
import '../widgets/app_status_widgets.dart';
import '../providers/material_providers.dart';

enum MaterialFormType {
  file,
  youtube,
  spotify,
  text,
}

class MaterialFormData {
  MaterialFormType? type;
  String? materialKindId;
  String? materialTypeId;
  File? file;
  String? url;
  String? text;
  bool isOld;
  String? oldDescription;

  MaterialFormData({
    this.type,
    this.materialKindId,
    this.materialTypeId,
    this.file,
    this.url,
    this.text,
    this.isOld = false,
    this.oldDescription,
  });
}

class MaterialFormDialog extends ConsumerStatefulWidget {
  final String praiseId;
  final PraiseMaterialResponse? material; // Se fornecido, é edição

  const MaterialFormDialog({
    super.key,
    required this.praiseId,
    this.material,
  });

  @override
  ConsumerState<MaterialFormDialog> createState() => _MaterialFormDialogState();
}

class _MaterialFormDialogState extends ConsumerState<MaterialFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late MaterialFormData _formData;
  bool _isLoading = false;
  late TextEditingController _urlController;
  late TextEditingController _textController;
  late TextEditingController _oldDescriptionController;

  @override
  void initState() {
    super.initState();
    if (widget.material != null) {
      // Modo edição - inicializar com dados existentes
      final material = widget.material!;
      final typeName = material.materialType?.name.toLowerCase() ?? '';
      
      MaterialFormType? type;
      if (typeName == 'pdf' || typeName == 'audio') {
        type = MaterialFormType.file;
      } else if (typeName == 'youtube') {
        type = MaterialFormType.youtube;
      } else if (typeName == 'spotify') {
        type = MaterialFormType.spotify;
      } else if (typeName == 'text') {
        type = MaterialFormType.text;
      }

      final url = type == MaterialFormType.youtube || type == MaterialFormType.spotify 
          ? material.path 
          : '';
      final text = type == MaterialFormType.text ? material.path : '';

      _urlController = TextEditingController(text: url);
      _textController = TextEditingController(text: text);
      _oldDescriptionController = TextEditingController(text: material.oldDescription ?? '');

      _formData = MaterialFormData(
        type: type,
        materialKindId: material.materialKindId,
        materialTypeId: material.materialTypeId,
        url: url.isEmpty ? null : url,
        text: text.isEmpty ? null : text,
        isOld: material.isOld ?? false,
        oldDescription: material.oldDescription,
      );
    } else {
      // Modo criação
      _urlController = TextEditingController();
      _textController = TextEditingController();
      _oldDescriptionController = TextEditingController();
      _formData = MaterialFormData();
    }
  }

  @override
  void dispose() {
    _urlController.dispose();
    _textController.dispose();
    _oldDescriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'mp3', 'wav', 'm4a', 'wma', 'ogg', 'flac'],
        withData: false,
        withReadStream: false,
      );

      if (result != null && result.files.single.path != null) {
        setState(() {
          _formData.file = File(result.files.single.path!);
        });
      } else if (result != null && result.files.single.path == null) {
        // Tentar usar bytes se path não estiver disponível (pode acontecer em algumas plataformas)
        if (result.files.single.bytes != null) {
          // Salvar temporariamente e usar o arquivo
          final tempDir = await Directory.systemTemp.createTemp('coldigom_upload');
          final tempFile = File('${tempDir.path}/${result.files.single.name}');
          await tempFile.writeAsBytes(result.files.single.bytes!);
          setState(() {
            _formData.file = tempFile;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n?.errorSelectFile(e.toString()) ?? 'Erro ao selecionar arquivo: $e'),
            duration: const Duration(seconds: 5),
          ),
        );
      }
    }
  }

  String? _getMaterialTypeIdForType(MaterialFormType type, List<MaterialTypeResponse> types) {
    switch (type) {
      case MaterialFormType.file:
        // Determinar se é PDF ou Audio baseado na extensão do arquivo
        if (_formData.file != null) {
          final ext = _formData.file!.path.split('.').last.toLowerCase();
          if (ext == 'pdf') {
            return types.firstWhere((t) => t.name.toLowerCase() == 'pdf').id;
          } else {
            return types.firstWhere((t) => t.name.toLowerCase() == 'audio').id;
          }
        }
        return types.firstWhere((t) => t.name.toLowerCase() == 'pdf').id;
      case MaterialFormType.youtube:
        return types.firstWhere((t) => t.name.toLowerCase() == 'youtube').id;
      case MaterialFormType.spotify:
        return types.firstWhere((t) => t.name.toLowerCase() == 'spotify').id;
      case MaterialFormType.text:
        return types.firstWhere((t) => t.name.toLowerCase() == 'text').id;
    }
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final l10n = AppLocalizations.of(context);
    if (_formData.type == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n?.validationSelectMaterialType ?? 'Selecione o tipo de material')),
      );
      return;
    }

    if (_formData.materialKindId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n?.validationSelectMaterialKind ?? 'Selecione o Material Kind')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final apiService = ref.read(apiServiceProvider);
      final typesAsync = await ref.read(materialTypesProvider.future);
      
      // Atualizar dados dos controllers
      if (_formData.type == MaterialFormType.youtube || _formData.type == MaterialFormType.spotify) {
        _formData.url = _urlController.text.trim();
      } else if (_formData.type == MaterialFormType.text) {
        _formData.text = _textController.text.trim();
      }
      _formData.oldDescription = _oldDescriptionController.text.trim().isEmpty 
          ? null 
          : _oldDescriptionController.text.trim();
      
      _formData.materialTypeId = _getMaterialTypeIdForType(_formData.type!, typesAsync);

      if (widget.material != null) {
        // Edição
        if (_formData.type == MaterialFormType.file && _formData.file != null) {
          // Substituir arquivo usando endpoint PUT /upload
          final result = await apiService.replaceMaterialFile(
            widget.material!.id,
            _formData.file!,
            materialKindId: _formData.materialKindId,
            isOld: _formData.isOld,
            oldDescription: _formData.oldDescription?.isEmpty ?? true 
                ? null 
                : _formData.oldDescription,
          );
          
          // Limpar cache offline do arquivo antigo
          // O AudioPlayerService salva arquivos offline usando materialId como nome
          try {
            final appDir = await getApplicationDocumentsDirectory();
            final offlineDir = Directory('${appDir.path}/offline_pdfs');
            if (await offlineDir.exists()) {
              final materialId = widget.material!.id;
              // Tentar deletar possíveis extensões de áudio
              final audioExtensions = ['.mp3', '.wav', '.m4a', '.wma', '.aac', '.ogg'];
              for (final ext in audioExtensions) {
                final cachedFile = File('${offlineDir.path}/$materialId$ext');
                if (await cachedFile.exists()) {
                  await cachedFile.delete();
                }
              }
            }
          } catch (e) {
            // Log erro mas não falhar a operação
            debugPrint('Erro ao limpar cache offline: $e');
          }
        } else {
          // Atualizar campos
          final update = PraiseMaterialUpdate(
            materialKindId: _formData.materialKindId,
            path: _formData.type == MaterialFormType.text 
                ? _formData.text 
                : _formData.url,
            isOld: _formData.isOld,
            oldDescription: _formData.oldDescription?.isEmpty ?? true 
                ? null 
                : _formData.oldDescription,
          );
          await apiService.updateMaterial(widget.material!.id, update);
        }
      } else {
        // Criação
        if (_formData.type == MaterialFormType.file) {
          if (_formData.file == null) {
            throw Exception('Selecione um arquivo');
          }
          await apiService.uploadMaterial(
            widget.praiseId,
            _formData.file!,
            _formData.materialKindId!,
            isOld: _formData.isOld,
            oldDescription: _formData.oldDescription?.isEmpty ?? true 
                ? null 
                : _formData.oldDescription,
          );
        } else {
          final create = PraiseMaterialCreate(
            praiseId: widget.praiseId,
            materialKindId: _formData.materialKindId!,
            materialTypeId: _formData.materialTypeId!,
            path: _formData.type == MaterialFormType.text 
                ? _formData.text! 
                : _formData.url!,
            isOld: _formData.isOld,
            oldDescription: _formData.oldDescription?.isEmpty ?? true 
                ? null 
                : _formData.oldDescription,
          );
          await apiService.createMaterial(create);
        }
      }

      if (mounted) {
        Navigator.of(context).pop(true); // Retorna true para indicar sucesso
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n?.errorSaveMaterial(e.toString()) ?? 'Erro ao salvar material: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final kindsAsync = ref.watch(materialKindsProvider);
    final l10n = AppLocalizations.of(context)!;

    return Dialog(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 700),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.material != null ? 'Editar Material' : 'Adicionar Material',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(context).pop(false),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Tipo de Material
                      Text(
                        '${l10n.labelMaterialTypeRequired}',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      SegmentedButton<MaterialFormType>(
                        segments: [
                          ButtonSegment(
                            value: MaterialFormType.file,
                            label: Text(MaterialFormType.file.localizedName(context)),
                            icon: const Icon(Icons.insert_drive_file),
                          ),
                          ButtonSegment(
                            value: MaterialFormType.youtube,
                            label: Text(MaterialFormType.youtube.localizedName(context)),
                            icon: const Icon(Icons.play_circle),
                          ),
                          ButtonSegment(
                            value: MaterialFormType.spotify,
                            label: Text(MaterialFormType.spotify.localizedName(context)),
                            icon: const Icon(Icons.music_note),
                          ),
                          ButtonSegment(
                            value: MaterialFormType.text,
                            label: Text(MaterialFormType.text.localizedName(context)),
                            icon: const Icon(Icons.text_fields),
                          ),
                        ],
                        selected: _formData.type != null ? {_formData.type!} : {},
                        emptySelectionAllowed: true,
                        onSelectionChanged: (Set<MaterialFormType> selection) {
                          setState(() {
                            _formData.type = selection.firstOrNull;
                            _formData.file = null;
                            _formData.url = null;
                            _formData.text = null;
                          });
                        },
                      ),
                      const SizedBox(height: 24),

                      // Campos específicos por tipo
                      if (_formData.type == MaterialFormType.file) ...[
                        // Mostrar arquivo atual se estiver editando
                        if (widget.material != null && _formData.file == null) ...[
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.grey[100],
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.grey[300]!),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.insert_drive_file, color: Colors.grey[600]),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Arquivo Atual',
                                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                          color: Colors.grey[600],
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        widget.material!.path.split('/').last,
                                        style: Theme.of(context).textTheme.bodyMedium,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Selecione um novo arquivo para substituir',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey[600],
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                        Builder(
                          builder: (context) {
                            String buttonText;
                            if (_formData.file != null) {
                              final fileName = _formData.file!.path.split('/').last;
                              // Truncar nome do arquivo se muito longo (máximo 30 caracteres)
                              final truncatedName = fileName.length > 30 
                                  ? '${fileName.substring(0, 27)}...'
                                  : fileName;
                              buttonText = 'Novo Arquivo: $truncatedName';
                            } else {
                              buttonText = widget.material != null 
                                  ? 'Selecionar Novo Arquivo'
                                  : 'Selecionar Arquivo';
                            }
                            return AppButton(
                              text: buttonText,
                              icon: _formData.file != null ? Icons.file_upload : Icons.upload_file,
                              onPressed: _pickFile,
                            );
                          },
                        ),
                        if (_formData.file == null && widget.material == null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              'Selecione um arquivo PDF ou de áudio',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Colors.grey,
                              ),
                            ),
                          ),
                        if (_formData.file != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Row(
                              children: [
                                Icon(Icons.check_circle, color: Colors.green, size: 16),
                                const SizedBox(width: 4),
                                Text(
                                  'Novo arquivo selecionado. O arquivo atual será substituído.',
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: Colors.green[700],
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ] else if (_formData.type == MaterialFormType.youtube ||
                          _formData.type == MaterialFormType.spotify) ...[
                        AppTextField(
                          label: l10n.labelUrl,
                          hint: 'Cole a URL do ${_formData.type == MaterialFormType.youtube ? "YouTube" : "Spotify"}',
                          controller: _urlController,
                          validator: (value) {
                            if (value == null || value.trim().isEmpty) {
                              return l10n.validationUrlRequired;
                            }
                            final uri = Uri.tryParse(value);
                            if (uri == null || !uri.hasAbsolutePath) {
                              return l10n.validationUrlInvalid;
                            }
                            return null;
                          },
                          prefixIcon: Icons.link,
                        ),
                      ] else if (_formData.type == MaterialFormType.text) ...[
                        AppTextField(
                          label: l10n.labelText,
                          hint: l10n.hintEnterText,
                          controller: _textController,
                          validator: (value) {
                            if (value == null || value.trim().isEmpty) {
                              return l10n.validationTextRequired;
                            }
                            return null;
                          },
                          maxLines: 5,
                          prefixIcon: Icons.text_fields,
                        ),
                      ],

                      const SizedBox(height: 24),

                      // Material Kind
                      Text(
                        l10n.labelMaterialKindRequired,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      kindsAsync.when(
                        data: (kinds) {
                          if (kinds.isEmpty) {
                            return Padding(
                              padding: const EdgeInsets.all(8.0),
                              child: Text(l10n.messageNoMaterialKindsAvailable),
                            );
                          }
                          return DropdownButtonFormField<String>(
                            value: _formData.materialKindId,
                            decoration: InputDecoration(
                              hintText: l10n.labelSelectMaterialKind,
                            ),
                            items: kinds.map((kind) {
                              return DropdownMenuItem(
                                value: kind.id,
                                child: Text(kind.name),
                              );
                            }).toList(),
                            onChanged: (value) {
                              setState(() {
                                _formData.materialKindId = value;
                              });
                            },
                            validator: (value) {
                              if (value == null) {
                                return l10n.validationSelectMaterialKind;
                              }
                              return null;
                            },
                          );
                        },
                        loading: () => AppLoadingIndicator(message: l10n.statusLoading),
                        error: (error, stack) => AppErrorWidget(
                          message: 'Erro ao carregar Material Kinds: $error',
                          onRetry: () {
                            ref.invalidate(materialKindsProvider);
                          },
                        ),
                      ),

                      const SizedBox(height: 24),

                      // Opções
                      CheckboxListTile(
                        title: Text(l10n.labelMaterialIsOld),
                        subtitle: Text(l10n.hintEnterOldDescription),
                        value: _formData.isOld,
                        onChanged: (value) {
                          setState(() {
                            _formData.isOld = value ?? false;
                          });
                        },
                      ),

                      if (_formData.isOld) ...[
                        const SizedBox(height: 8),
                        AppTextField(
                          label: l10n.labelMaterialOldDescription,
                          hint: l10n.hintEnterOldDescription,
                          controller: _oldDescriptionController,
                          maxLines: 3,
                          prefixIcon: Icons.description,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: _isLoading ? null : () => Navigator.of(context).pop(false),
                      child: Text(l10n.buttonCancel),
                    ),
                    const SizedBox(width: 8),
                    AppButton(
                      text: l10n.buttonSave,
                      icon: Icons.save,
                      onPressed: _isLoading ? null : _handleSave,
                      isLoading: _isLoading,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
