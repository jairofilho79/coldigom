import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
                      'Baixar por Material Kind',
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
                      'Material Kind *',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    kindsAsync.when(
                      data: (kinds) {
                        if (kinds.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.all(8.0),
                            child: Text('Nenhum Material Kind disponível'),
                          );
                        }
                        return DropdownButtonFormField<String>(
                          initialValue: _selectedMaterialKindId,
                          decoration: const InputDecoration(
                            hintText: 'Selecione o Material Kind',
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
                              return 'Material Kind é obrigatório';
                            }
                            return null;
                          },
                        );
                      },
                      loading: () => const AppLoadingIndicator(message: 'Carregando...'),
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
                          decoration: const InputDecoration(
                            hintText: 'Selecione uma tag (opcional)',
                          ),
                          items: [
                            const DropdownMenuItem<String?>(
                              value: null,
                              child: Text('Nenhuma tag (todos os praises)'),
                            ),
                            ...tags.map((tag) {
                              return DropdownMenuItem<String?>(
                                value: tag.id,
                                child: Text(tag.name),
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
                      loading: () => const AppLoadingIndicator(message: 'Carregando tags...'),
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
                      'Tamanho máximo por ZIP: $_maxZipSizeMb MB',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    Slider(
                      value: _maxZipSizeMb.toDouble(),
                      min: 10,
                      max: 1000,
                      divisions: 99,
                      label: '$_maxZipSizeMb MB',
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
                    child: const Text('Cancelar'),
                  ),
                  const SizedBox(width: 8),
                  AppButton(
                    text: 'Baixar',
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
    if (_selectedMaterialKindId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecione um Material Kind')),
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
      
      final downloadService = ref.read(offlineDownloadServiceProvider);
      
      String? errorMessage;
      final filePath = await downloadService.downloadByMaterialKind(
        _selectedMaterialKindId!,
        materialKind.name,
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
            content: Text('Erro ao baixar ZIP: $errorMessage'),
            duration: const Duration(seconds: 5),
          ),
        );
      } else if (filePath == null) {
        // Usuário cancelou a seleção de arquivo
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Download cancelado'),
            duration: Duration(seconds: 2),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('ZIP salvo em: $filePath'),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop(false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao baixar ZIP: $e'),
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
