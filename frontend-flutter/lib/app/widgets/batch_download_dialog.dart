import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../../core/i18n/entity_translation_providers.dart';
import '../models/praise_tag_model.dart';
import '../models/material_kind_model.dart';
import '../services/api/api_service.dart';
import '../services/offline/batch_download_service.dart';
import '../services/offline/download_service.dart';
import '../providers/material_providers.dart';
import 'batch_download_progress_dialog.dart';

/// Provider para lista de tags (reutilizado)
final tagsProviderForBatch = FutureProvider<List<PraiseTagResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getTags(limit: 1000);
});

class BatchDownloadDialog extends ConsumerStatefulWidget {
  const BatchDownloadDialog({super.key});

  @override
  ConsumerState<BatchDownloadDialog> createState() => _BatchDownloadDialogState();
}

class _BatchDownloadDialogState extends ConsumerState<BatchDownloadDialog> {
  final Set<String> _selectedTagIds = {};
  final Set<String> _selectedMaterialKindIds = {};
  String _operation = 'union'; // 'union' ou 'intersection'
  bool _keepOffline = true;
  bool _useZipBatches = true; // quando keepOffline=false: dividir em ZIPs ou ZIP único
  int _maxZipSizeMb = 100;
  bool _isSearching = false;
  bool _isDownloadingZip = false;
  int? _estimatedCount;
  int? _estimatedSize;

  @override
  Widget build(BuildContext context) {
    final kindsAsync = ref.watch(materialKindsProvider);
    final tagsAsync = ref.watch(tagsProviderForBatch);
    ref.watch(praiseTagTranslationsProvider);
    ref.watch(materialKindTranslationsProvider);
    final l10n = AppLocalizations.of(context)!;

    return Dialog(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Download em Lote',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                    IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: (_isSearching || _isDownloadingZip) ? null : () => Navigator.of(context).pop(),
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
                    // Seleção de Tags (múltipla)
                    Text(
                      'Tags (opcional)',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    tagsAsync.when(
                      data: (tags) => _buildTagChips(tags),
                      loading: () => const CircularProgressIndicator(),
                      error: (error, stack) => Text('Erro: $error'),
                    ),
                    const SizedBox(height: 16),
                    
                    // Seleção de Material Kinds (múltipla)
                    Text(
                      'Material Kinds (opcional)',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    kindsAsync.when(
                      data: (kinds) => _buildMaterialKindChips(kinds),
                      loading: () => const CircularProgressIndicator(),
                      error: (error, stack) => Text('Erro: $error'),
                    ),
                    const SizedBox(height: 16),
                    
                    // Seção Avançado (colapsável)
                    Card(
                      child: ExpansionTile(
                        title: const Text('Avançado'),
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Operação (União vs Intersecção)
                                Text(
                                  'Operação',
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    Expanded(
                                      child: RadioListTile<String>(
                                        title: const Text('União (OU)'),
                                        subtitle: const Text('Materiais que têm qualquer tag OU qualquer material kind'),
                                        value: 'union',
                                        groupValue: _operation,
                                        onChanged: _isSearching
                                            ? null
                                            : (value) {
                                                if (value != null) {
                                                  setState(() {
                                                    _operation = value;
                                                    _estimatedCount = null;
                                                    _estimatedSize = null;
                                                  });
                                                }
                                              },
                                      ),
                                    ),
                                    Expanded(
                                      child: RadioListTile<String>(
                                        title: const Text('Intersecção (E)'),
                                        subtitle: const Text('Materiais que têm todas as tags E todos os material kinds'),
                                        value: 'intersection',
                                        groupValue: _operation,
                                        onChanged: _isSearching
                                            ? null
                                            : (value) {
                                                if (value != null) {
                                                  setState(() {
                                                    _operation = value;
                                                    _estimatedCount = null;
                                                    _estimatedSize = null;
                                                  });
                                                }
                                              },
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                // Opção: Download externo vs Keep offline
                                CheckboxListTile(
                                  title: const Text('Manter Offline'),
                                  subtitle: const Text('Se marcado, materiais serão mantidos offline. Caso contrário, será download externo.'),
                                  value: _keepOffline,
                                  onChanged: _isSearching
                                      ? null
                                      : (value) {
                                          setState(() {
                                            _keepOffline = value ?? false;
                                          });
                                        },
                                ),
                                // Baixar por lotes de ZIP (só quando Manter Offline desmarcado)
                                if (!_keepOffline) ...[
                                  const SizedBox(height: 8),
                                  CheckboxListTile(
                                    title: const Text('Baixar por lotes de ZIP'),
                                    subtitle: const Text('Se marcado, divide em múltiplos arquivos ZIP pelo tamanho. Caso contrário, um único ZIP.'),
                                    value: _useZipBatches,
                                    onChanged: _isSearching
                                        ? null
                                        : (value) {
                                            setState(() {
                                              _useZipBatches = value ?? false;
                                            });
                                          },
                                  ),
                                  if (_useZipBatches) ...[
                                    const SizedBox(height: 8),
                                    Text(
                                      'Tamanho máximo por ZIP (MB): $_maxZipSizeMb MB',
                                      style: Theme.of(context).textTheme.titleSmall,
                                    ),
                                    Slider(
                                      value: _maxZipSizeMb.toDouble(),
                                      min: 10,
                                      max: 1000,
                                      divisions: 99,
                                      onChanged: _isSearching
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
                                          Text('10 MB', style: Theme.of(context).textTheme.bodySmall),
                                          Text('1000 MB', style: Theme.of(context).textTheme.bodySmall),
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
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    
                    // Botão para estimar
                    if (_selectedTagIds.isNotEmpty || _selectedMaterialKindIds.isNotEmpty)
                      ElevatedButton.icon(
                        onPressed: _isSearching ? null : _estimateMaterials,
                        icon: _isSearching
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.calculate),
                        label: const Text('Estimar Materiais'),
                      ),
                    
                    // Exibir estimativa
                    if (_estimatedCount != null)
                      Card(
                        color: Colors.blue.shade900,
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Estimativa:',
                                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Materiais encontrados: $_estimatedCount',
                                style: const TextStyle(color: Colors.white),
                              ),
                              if (_estimatedSize != null)
                                Text(
                                  'Tamanho estimado: ${_formatSize(_estimatedSize!)}',
                                  style: const TextStyle(color: Colors.white),
                                ),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 16),
                    
                    // Botões de ação
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: _isSearching ? null : () => Navigator.of(context).pop(),
                          child: const Text('Cancelar'),
                        ),
                        const SizedBox(width: 8),
                        ElevatedButton(
                          onPressed: (_isSearching || _isDownloadingZip ||
                                     (_selectedTagIds.isEmpty && _selectedMaterialKindIds.isEmpty))
                              ? null
                              : _startDownload,
                          child: const Text('Iniciar Download'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTagChips(List<PraiseTagResponse> tags) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: tags.map((tag) {
        final isSelected = _selectedTagIds.contains(tag.id);
        return FilterChip(
          label: Text(getPraiseTagName(ref, tag.id, tag.name)),
          selected: isSelected,
          onSelected: _isSearching
              ? null
              : (selected) {
                  setState(() {
                    if (selected) {
                      _selectedTagIds.add(tag.id);
                    } else {
                      _selectedTagIds.remove(tag.id);
                    }
                    _estimatedCount = null;
                    _estimatedSize = null;
                  });
                },
        );
      }).toList(),
    );
  }

  Widget _buildMaterialKindChips(List<MaterialKindResponse> kinds) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: kinds.map((kind) {
        final isSelected = _selectedMaterialKindIds.contains(kind.id);
        return FilterChip(
          label: Text(getMaterialKindName(ref, kind.id, kind.name)),
          selected: isSelected,
          onSelected: _isSearching
              ? null
              : (selected) {
                  setState(() {
                    if (selected) {
                      _selectedMaterialKindIds.add(kind.id);
                    } else {
                      _selectedMaterialKindIds.remove(kind.id);
                    }
                    _estimatedCount = null;
                    _estimatedSize = null;
                  });
                },
        );
      }).toList(),
    );
  }

  Future<void> _estimateMaterials() async {
    if (_selectedTagIds.isEmpty && _selectedMaterialKindIds.isEmpty) {
      return;
    }

    setState(() {
      _isSearching = true;
    });

    try {
      final batchService = ref.read(batchDownloadServiceProvider);
      final materials = await batchService.searchMaterials(
        tagIds: _selectedTagIds.isEmpty ? null : _selectedTagIds.toList(),
        materialKindIds: _selectedMaterialKindIds.isEmpty
            ? null
            : _selectedMaterialKindIds.toList(),
        operation: _operation,
      );

      final estimatedSize = await batchService.estimateTotalSize(materials);

      setState(() {
        _estimatedCount = materials.length;
        _estimatedSize = estimatedSize;
        _isSearching = false;
      });
    } catch (e) {
      setState(() {
        _isSearching = false;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao estimar: $e')),
        );
      }
    }
  }

  Future<void> _startDownload() async {
    if (_selectedTagIds.isEmpty && _selectedMaterialKindIds.isEmpty) {
      return;
    }

    if (_keepOffline) {
      Navigator.of(context).pop();
      if (mounted) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) => BatchDownloadProgressDialog(
            tagIds: _selectedTagIds.isEmpty ? null : _selectedTagIds.toList(),
            materialKindIds: _selectedMaterialKindIds.isEmpty
                ? null
                : _selectedMaterialKindIds.toList(),
            operation: _operation,
            keepOffline: true,
          ),
        );
      }
      return;
    }

    // Download externo (ZIP)
    setState(() {
      _isDownloadingZip = true;
    });

    final tagIds = _selectedTagIds.isEmpty ? null : _selectedTagIds.toList();
    final materialKindIds = _selectedMaterialKindIds.isEmpty ? null : _selectedMaterialKindIds.toList();
    final maxZipSizeMb = _useZipBatches ? _maxZipSizeMb : 10000; // 10000 = ZIP único

    final scaffoldMessenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final l10n = AppLocalizations.of(context)!;

    try {
      final downloadService = ref.read(offlineDownloadServiceProvider);

      navigator.pop();

      final filePath = await downloadService.downloadBatchZip(
        tagIds: tagIds,
        materialKindIds: materialKindIds,
        operation: _operation,
        maxZipSizeMb: maxZipSizeMb,
        onProgress: (_) {},
        onError: (_) {},
      );

      if (filePath == null) {
        scaffoldMessenger.showSnackBar(
          SnackBar(
            content: Text(l10n.errorDownloadCanceled),
            duration: const Duration(seconds: 2),
          ),
        );
      } else {
        scaffoldMessenger.showSnackBar(
          SnackBar(
            content: Text(l10n.messageZipSaved(filePath)),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      scaffoldMessenger.showSnackBar(
        SnackBar(
          content: Text(l10n.errorDownloadZip(e.toString())),
          duration: const Duration(seconds: 5),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isDownloadingZip = false;
        });
      }
    }
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) {
      return '$bytes B';
    } else if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(2)} KB';
    } else if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
    } else {
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
    }
  }
}
