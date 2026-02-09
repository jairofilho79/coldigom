import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/offline/offline_metadata_service.dart';
import '../services/offline/version_service.dart';
import '../models/offline_material_metadata.dart';
import '../models/praise_material_model.dart';

/// Estratégia de resolução de conflito
enum ConflictResolutionStrategy {
  keepLocal,
  replaceWithSnapshot,
  keepBoth,
}

/// Widget para resolver conflitos ao importar snapshot (UC-147)
class SnapshotConflictResolver extends ConsumerStatefulWidget {
  final List<SnapshotConflict> conflicts;
  final Function(Map<String, ConflictResolutionStrategy>) onResolved;

  const SnapshotConflictResolver({
    super.key,
    required this.conflicts,
    required this.onResolved,
  });

  @override
  ConsumerState<SnapshotConflictResolver> createState() =>
      _SnapshotConflictResolverState();
}

class _SnapshotConflictResolverState
    extends ConsumerState<SnapshotConflictResolver> {
  final Map<String, ConflictResolutionStrategy> _resolutions = {};
  ConflictResolutionStrategy? _defaultStrategy;

  @override
  void initState() {
    super.initState();
    // Inicializar todas as resoluções como null (não resolvido)
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Resolver Conflitos'),
      content: Container(
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 500),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${widget.conflicts.length} conflito(s) encontrado(s)',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 16),
            
            // Estratégia padrão para todos
            Card(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Aplicar a todos:'),
                    Row(
                      children: [
                        Expanded(
                          child: RadioListTile<ConflictResolutionStrategy>(
                            title: const Text('Manter Local'),
                            value: ConflictResolutionStrategy.keepLocal,
                            groupValue: _defaultStrategy,
                            onChanged: (value) {
                              setState(() {
                                _defaultStrategy = value;
                                _applyToAll(value!);
                              });
                            },
                          ),
                        ),
                        Expanded(
                          child: RadioListTile<ConflictResolutionStrategy>(
                            title: const Text('Substituir por Snapshot'),
                            value: ConflictResolutionStrategy.replaceWithSnapshot,
                            groupValue: _defaultStrategy,
                            onChanged: (value) {
                              setState(() {
                                _defaultStrategy = value;
                                _applyToAll(value!);
                              });
                            },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            
            // Lista de conflitos
            Expanded(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: widget.conflicts.length,
                itemBuilder: (context, index) {
                  final conflict = widget.conflicts[index];
                  return _buildConflictTile(conflict);
                },
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: _allResolved ? _applyResolutions : null,
          child: const Text('Aplicar'),
        ),
      ],
    );
  }

  Widget _buildConflictTile(SnapshotConflict conflict) {
    final resolution = _resolutions[conflict.materialId] ?? _defaultStrategy;
    
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ExpansionTile(
        title: Text(conflict.materialName),
        subtitle: Text('Material ID: ${conflict.materialId}'),
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Versão Local: ${conflict.localVersion ?? "N/A"}'),
                Text('Versão Snapshot: ${conflict.snapshotVersion ?? "N/A"}'),
                const SizedBox(height: 16),
                const Text('Escolha a estratégia:'),
                RadioListTile<ConflictResolutionStrategy>(
                  title: const Text('Manter Local'),
                  value: ConflictResolutionStrategy.keepLocal,
                  groupValue: resolution,
                  onChanged: (value) {
                    setState(() {
                      _resolutions[conflict.materialId] = value!;
                    });
                  },
                ),
                RadioListTile<ConflictResolutionStrategy>(
                  title: const Text('Substituir por Snapshot'),
                  value: ConflictResolutionStrategy.replaceWithSnapshot,
                  groupValue: resolution,
                  onChanged: (value) {
                    setState(() {
                      _resolutions[conflict.materialId] = value!;
                    });
                  },
                ),
                RadioListTile<ConflictResolutionStrategy>(
                  title: const Text('Manter Ambos (Renomear)'),
                  value: ConflictResolutionStrategy.keepBoth,
                  groupValue: resolution,
                  onChanged: (value) {
                    setState(() {
                      _resolutions[conflict.materialId] = value!;
                    });
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _applyToAll(ConflictResolutionStrategy strategy) {
    setState(() {
      for (final conflict in widget.conflicts) {
        _resolutions[conflict.materialId] = strategy;
      }
    });
  }

  bool get _allResolved {
    if (widget.conflicts.isEmpty) return true;
    if (_defaultStrategy != null) return true;
    
    for (final conflict in widget.conflicts) {
      if (!_resolutions.containsKey(conflict.materialId)) {
        return false;
      }
    }
    return true;
  }

  void _applyResolutions() {
    // Preencher resoluções não definidas com estratégia padrão
    final finalResolutions = <String, ConflictResolutionStrategy>{};
    
    for (final conflict in widget.conflicts) {
      final resolution = _resolutions[conflict.materialId] ?? 
                        _defaultStrategy ?? 
                        ConflictResolutionStrategy.keepLocal;
      finalResolutions[conflict.materialId] = resolution;
    }
    
    widget.onResolved(finalResolutions);
    Navigator.of(context).pop();
  }
}

class SnapshotConflict {
  final String materialId;
  final String materialName;
  final String? localVersion;
  final String? snapshotVersion;
  final OfflineMaterialMetadata? localMetadata;
  final PraiseMaterialResponse? snapshotMaterial;

  SnapshotConflict({
    required this.materialId,
    required this.materialName,
    this.localVersion,
    this.snapshotVersion,
    this.localMetadata,
    this.snapshotMaterial,
  });
}
