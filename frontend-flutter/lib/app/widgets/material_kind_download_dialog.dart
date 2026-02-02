import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../models/praise_tag_model.dart';
import '../services/api/api_service.dart';
import '../services/offline/download_service.dart';
import '../widgets/app_button.dart';
import '../widgets/app_status_widgets.dart';
import '../providers/material_providers.dart';

/// Provider para lista de tags (reutilizado)
final tagsProvider = FutureProvider<List<PraiseTagResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getTags(limit: 1000);
});

class MaterialKindDownloadDialog extends ConsumerStatefulWidget {
  const MaterialKindDownloadDialog({super.key});

  @override
  ConsumerState<MaterialKindDownloadDialog> createState() => _MaterialKindDownloadDialogState();
}

class _MaterialKindDownloadDialogState extends ConsumerState<MaterialKindDownloadDialog> {
  String? _selectedMaterialKindId;
  String? _selectedTagId;
  int _maxZipSizeMb = 100;
  bool _isDownloading = false;

  @override
  Widget build(BuildContext context) {
    final kindsAsync = ref.watch(materialKindsProvider);
    final tagsAsync = ref.watch(tagsProvider);
    final l10n = AppLocalizations.of(context)!;

    return Dialog(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.buttonDownloadByMaterialKind,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: _isDownloading ? null : () => Navigator.of(context).pop(false),
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
                          initialValue: _selectedMaterialKindId,
                          decoration: InputDecoration(
                            hintText: l10n.labelSelectMaterialKindForDownload,
                          ),
                          items: kinds.map((kind) {
                            return DropdownMenuItem(
                              value: kind.id,
                              child: Text(kind.name),
                            );
                          }).toList(),
                          onChanged: _isDownloading
                              ? null
                              : (value) {
                                  setState(() {
                                    _selectedMaterialKindId = value;
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

                    // Tag (opcional)
                    Text(
                      'Filtrar por Tag (opcional)',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    tagsAsync.when(
                      data: (tags) {
                        return DropdownButtonFormField<String?>(
                          initialValue: _selectedTagId,
                          decoration: InputDecoration(
                            hintText: l10n.labelSelectTag,
                          ),
                          items: [
                            DropdownMenuItem<String?>(
                              value: null,
                              child: Text('Nenhuma tag (todos os praises)'),
                            ),
                            ...tags.map((tag) {
                              final tagName = getPraiseTagName(ref, tag.id, tag.name);
                              return DropdownMenuItem<String?>(
                                value: tag.id,
                                child: Text(tagName),
                              );
                            }),
                          ],
                          onChanged: _isDownloading
                              ? null
                              : (value) {
                                  setState(() {
                                    _selectedTagId = value;
                                  });
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

                    const SizedBox(height: 24),

                    // Tamanho máximo do ZIP
                    Text(
                      '${l10n.labelMaxZipSize}: $_maxZipSizeMb MB',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    Slider(
                      value: _maxZipSizeMb.toDouble(),
                      min: 10,
                      max: 1000,
                      divisions: 99,
                      label: l10n.messageMaxZipSize.replaceAll('{size}', _maxZipSizeMb.toString()),
                      onChanged: _isDownloading
                          ? null
                          : (value) {
                              setState(() {
                                _maxZipSizeMb = value.round();
                              });
                            },
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8.0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '10 MB',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          Text(
                            '1000 MB',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(8.0),
                      child: Text(
                        'Se o download exceder este tamanho, será dividido em múltiplos arquivos ZIP.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey,
                            ),
                      ),
                    ),
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
                    onPressed: _isDownloading ? null : () => Navigator.of(context).pop(false),
                    child: Text(l10n.buttonCancel),
                  ),
                  const SizedBox(width: 8),
                  AppButton(
                    text: l10n.buttonDownload,
                    icon: Icons.download,
                    onPressed: _isDownloading ? null : _handleDownload,
                    isLoading: _isDownloading,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleDownload() async {
    final l10n = AppLocalizations.of(context)!;
    if (_selectedMaterialKindId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.validationSelectMaterialKind)),
      );
      return;
    }

    setState(() {
      _isDownloading = true;
    });

    try {
      // Obter nome do Material Kind
      final kindsAsync = await ref.read(materialKindsProvider.future);
      final materialKind = kindsAsync.firstWhere((k) => k.id == _selectedMaterialKindId);
      final materialKindName = getMaterialKindName(ref, materialKind.id, materialKind.name);
      
      final downloadService = ref.read(offlineDownloadServiceProvider);
      
      String? errorMessage;
      final filePath = await downloadService.downloadByMaterialKind(
        _selectedMaterialKindId!,
        materialKindName,
        tagId: _selectedTagId,
        maxZipSizeMb: _maxZipSizeMb,
        onProgress: (progress) {
          // Progresso pode ser atualizado aqui se necessário
        },
        onError: (error) {
          errorMessage = error;
        },
      );

      if (!mounted) return;
      Navigator.of(context).pop(true); // Fechar dialog

      if (errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.errorDownloadZip.replaceAll('{error}', errorMessage!)),
            duration: const Duration(seconds: 5),
          ),
        );
      } else if (filePath == null) {
        // Usuário cancelou a seleção de arquivo
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.errorDownloadCanceled),
            duration: const Duration(seconds: 2),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.messageZipSaved.replaceAll('{path}', filePath)),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop(false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.errorDownloadZip.replaceAll('{error}', e.toString())),
          duration: const Duration(seconds: 5),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isDownloading = false;
        });
      }
    }
  }
}
