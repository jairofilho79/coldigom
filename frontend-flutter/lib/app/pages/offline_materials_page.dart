import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/app_dialog.dart';
import '../widgets/storage_info_widget.dart';
import '../widgets/material_status_indicator.dart';
import '../widgets/outdated_materials_widget.dart';
import '../services/offline/offline_metadata_service.dart';
import '../services/offline/download_service.dart';
import '../services/api/api_service.dart';
import '../models/offline_material_metadata.dart';
import '../models/praise_model.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../services/offline/version_service.dart';

/// Provider para lista de metadados offline agrupados por praise
final offlineMaterialsByPraiseProvider = FutureProvider<Map<String, List<OfflineMaterialMetadata>>>((ref) async {
  final metadataService = ref.watch(offlineMetadataServiceProvider);
  final allMetadata = metadataService.getAllMetadata();
  
  // Agrupar por praiseId
  final grouped = <String, List<OfflineMaterialMetadata>>{};
  for (final metadata in allMetadata) {
    if (!grouped.containsKey(metadata.praiseId)) {
      grouped[metadata.praiseId] = [];
    }
    grouped[metadata.praiseId]!.add(metadata);
  }
  
  return grouped;
});

/// Provider para buscar informações de um praise
final praiseByIdProvider = FutureProvider.family<PraiseResponse?, String>((ref, praiseId) async {
  try {
    final apiService = ref.watch(apiServiceProvider);
    return await apiService.getPraiseById(praiseId);
  } catch (e) {
    return null;
  }
});

/// Página para gerenciar materiais offline
class OfflineMaterialsPage extends ConsumerStatefulWidget {
  const OfflineMaterialsPage({super.key});

  @override
  ConsumerState<OfflineMaterialsPage> createState() => _OfflineMaterialsPageState();
}

class _OfflineMaterialsPageState extends ConsumerState<OfflineMaterialsPage> {
  String _searchQuery = '';
  String? _selectedTagId;
  String? _selectedMaterialKindId;
  String _sortBy = 'name'; // name, date, size
  bool _showOldMaterials = false;

  @override
  Widget build(BuildContext context) {
    final groupedMetadata = ref.watch(offlineMaterialsByPraiseProvider);

    return AppScaffold(
      appBar: AppBar(
        title: const Text('Materiais Offline'),
      ),
      body: groupedMetadata.when(
        data: (grouped) => _buildContent(grouped),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Text('Erro ao carregar materiais: $error'),
        ),
      ),
    );
  }

  Widget _buildContent(Map<String, List<OfflineMaterialMetadata>> grouped) {
    // Filtrar e ordenar
    final filtered = _filterAndSort(grouped);

    return Column(
      children: [
        // Informações de armazenamento
        const StorageInfoWidget(),
        
        // Materiais desatualizados
        const OutdatedMaterialsWidget(),
        
        // Filtros e busca
        _buildFilters(),
        
        // Lista de materiais
        Expanded(
          child: filtered.isEmpty
              ? const Center(
                  child: Text('Nenhum material offline encontrado'),
                )
              : ListView.builder(
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final entry = filtered[index];
                    return _buildPraiseGroup(entry.key, entry.value);
                  },
                ),
        ),
        
        // Botão para limpar cache completo
        Padding(
          padding: const EdgeInsets.all(16),
          child: ElevatedButton.icon(
            onPressed: _confirmClearCache,
            icon: const Icon(Icons.delete_sweep),
            label: const Text('Limpar Cache Completo'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFilters() {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          children: [
            // Busca
            TextField(
              decoration: const InputDecoration(
                hintText: 'Buscar por nome do material ou número do praise',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
            ),
            const SizedBox(height: 8),
            
            // Filtros e ordenação
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _sortBy,
                    decoration: const InputDecoration(
                      labelText: 'Ordenar por',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'name', child: Text('Nome')),
                      DropdownMenuItem(value: 'date', child: Text('Data')),
                      DropdownMenuItem(value: 'size', child: Text('Tamanho')),
                    ],
                    onChanged: (value) {
                      if (value != null) {
                        setState(() {
                          _sortBy = value;
                        });
                      }
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Switch(
                  value: _showOldMaterials,
                  onChanged: (value) {
                    setState(() {
                      _showOldMaterials = value;
                    });
                  },
                ),
                const Text('Mostrar antigos'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPraiseGroup(String praiseId, List<OfflineMaterialMetadata> materials) {
    return FutureBuilder<PraiseResponse?>(
      future: ref.read(praiseByIdProvider(praiseId).future),
      builder: (context, snapshot) {
        final praise = snapshot.data;
        final praiseName = praise?.name ?? 'Praise $praiseId';
        final praiseNumber = praise?.number;

        return ExpansionTile(
          title: Text(praiseName),
          subtitle: Text(
            '${materials.length} material(is) • ${_formatTotalSize(materials)}',
          ),
          trailing: IconButton(
            icon: const Icon(Icons.delete, color: Colors.red),
            onPressed: () => _confirmDeletePraise(praiseId, praiseName),
            tooltip: 'Remover todos os materiais deste praise',
          ),
          children: materials.map((metadata) => _buildMaterialTile(metadata)).toList(),
        );
      },
    );
  }

  Future<void> _confirmDeletePraise(String praiseId, String praiseName) async {
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: 'Remover Praise Completo',
      message: 'Deseja remover todos os materiais de "$praiseName" do cache offline?',
      confirmText: 'Remover',
      cancelText: 'Cancelar',
    );

    if (confirmed == true) {
      try {
        final downloadService = ref.read(offlineDownloadServiceProvider);
        
        // Inicializar serviços se necessário
        final metadataService = ref.read(offlineMetadataServiceProvider);
        final versionService = ref.read(versionServiceProvider);
        downloadService.initializeServices(metadataService, versionService);

        // Remover todos os materiais do praise
        await downloadService.removePraiseOffline(praiseId);

        // Atualizar lista
        ref.invalidate(offlineMaterialsByPraiseProvider);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Materiais do praise removidos com sucesso')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Erro ao remover materiais: $e')),
          );
        }
      }
    }
  }

  Widget _buildMaterialTile(OfflineMaterialMetadata metadata) {
    return ListTile(
      leading: MaterialStatusIndicator(materialId: metadata.materialId),
      title: FutureBuilder<String>(
        future: _getMaterialKindName(metadata.materialKindId),
        builder: (context, snapshot) {
          return Text(snapshot.data ?? 'Material ${metadata.materialId}');
        },
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Tamanho: ${_formatSize(metadata.fileSize)}'),
          Text('Baixado em: ${_formatDate(metadata.downloadedAt)}'),
          if (metadata.isOld)
            Row(
              children: [
                const Icon(Icons.history, size: 16, color: Colors.orange),
                const SizedBox(width: 4),
                Text(
                  'Material antigo',
                  style: TextStyle(color: Colors.orange.shade700),
                ),
                if (metadata.oldDescription != null && metadata.oldDescription!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(
                      '- ${metadata.oldDescription}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
              ],
            ),
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: const Icon(Icons.delete),
            color: Colors.red,
            onPressed: () => _confirmDeleteMaterial(metadata),
            tooltip: 'Remover material',
          ),
        ],
      ),
    );
  }

  List<MapEntry<String, List<OfflineMaterialMetadata>>> _filterAndSort(
    Map<String, List<OfflineMaterialMetadata>> grouped,
  ) {
    final filtered = <String, List<OfflineMaterialMetadata>>{};

    for (final entry in grouped.entries) {
      final materials = entry.value.where((m) {
        // Filtro de busca
        if (_searchQuery.isNotEmpty) {
          final query = _searchQuery.toLowerCase();
          // Buscar no nome do arquivo ou materialId
          if (!m.fileName.toLowerCase().contains(query) &&
              !m.materialId.toLowerCase().contains(query)) {
            return false;
          }
        }

        // Filtro de materiais antigos
        if (!_showOldMaterials && m.isOld) {
          return false;
        }

        // Filtro de tag (se implementado)
        // Filtro de material kind (se implementado)

        return true;
      }).toList();

      if (materials.isNotEmpty) {
        // Ordenar materiais
        materials.sort((a, b) {
          switch (_sortBy) {
            case 'name':
              return a.fileName.compareTo(b.fileName);
            case 'date':
              return b.downloadedAt.compareTo(a.downloadedAt);
            case 'size':
              return b.fileSize.compareTo(a.fileSize);
            default:
              return 0;
          }
        });

        filtered[entry.key] = materials;
      }
    }

    // Ordenar grupos por nome do praise (se disponível)
    final entries = filtered.entries.toList();
    // Por enquanto, ordenar por praiseId
    entries.sort((a, b) => a.key.compareTo(b.key));

    return entries;
  }

  Future<String> _getMaterialKindName(String materialKindId) async {
    try {
      return getMaterialKindName(ref, materialKindId, 'Material');
    } catch (e) {
      return 'Material';
    }
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) {
      return '$bytes B';
    } else if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(2)} KB';
    } else {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
    }
  }

  String _formatTotalSize(List<OfflineMaterialMetadata> materials) {
    final total = materials.fold<int>(0, (sum, m) => sum + m.fileSize);
    return _formatSize(total);
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  Future<void> _confirmDeleteMaterial(OfflineMaterialMetadata metadata) async {
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: 'Remover Material',
      message: 'Deseja remover "${metadata.fileName}" do cache offline?',
      confirmText: 'Remover',
      cancelText: 'Cancelar',
    );

    if (confirmed == true) {
      try {
        final downloadService = ref.read(offlineDownloadServiceProvider);
        final metadataService = ref.read(offlineMetadataServiceProvider);

        // Remover arquivo
        await downloadService.removeOfflineMaterial(metadata.materialId);
        
        // Remover metadados
        await metadataService.deleteMetadata(metadata.materialId);

        // Atualizar lista
        ref.invalidate(offlineMaterialsByPraiseProvider);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Material removido com sucesso')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Erro ao remover material: $e')),
          );
        }
      }
    }
  }

  Future<void> _confirmClearCache() async {
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: 'Limpar Cache Completo',
      message: 'Deseja remover TODOS os materiais offline? Esta ação não pode ser desfeita.',
      confirmText: 'Limpar Tudo',
      cancelText: 'Cancelar',
      confirmColor: Colors.red,
    );

    if (confirmed == true) {
      try {
        final downloadService = ref.read(offlineDownloadServiceProvider);
        
        // Inicializar serviços se necessário
        final metadataService = ref.read(offlineMetadataServiceProvider);
        final versionService = ref.read(versionServiceProvider);
        downloadService.initializeServices(metadataService, versionService);

        // Limpar todo o cache
        await downloadService.clearAllOfflineCache();

        // Atualizar lista
        ref.invalidate(offlineMaterialsByPraiseProvider);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Cache limpo com sucesso')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Erro ao limpar cache: $e')),
          );
        }
      }
    }
  }
}
