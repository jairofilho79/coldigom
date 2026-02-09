import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/offline/version_service.dart';
import '../services/offline/download_service.dart';
import '../services/api/api_service.dart';
import '../models/offline_material_metadata.dart';
import '../widgets/app_dialog.dart';
import '../../core/i18n/entity_translation_helper.dart';

/// Provider para lista de materiais desatualizados
final outdatedMaterialsProvider = FutureProvider<List<OfflineMaterialMetadata>>((ref) async {
  final versionService = ref.read(versionServiceProvider);
  return await versionService.getOutdatedMaterials();
});

/// Widget para listar materiais com atualizações disponíveis (UC-138)
class OutdatedMaterialsWidget extends ConsumerWidget {
  const OutdatedMaterialsWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outdatedMaterials = ref.watch(outdatedMaterialsProvider);

    return outdatedMaterials.when(
      data: (materials) {
        if (materials.isEmpty) {
          return const SizedBox.shrink();
        }

        return Card(
          margin: const EdgeInsets.all(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.update, color: Colors.orange),
                    const SizedBox(width: 8),
                    Text(
                      'Atualizações Disponíveis (${materials.length})',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ...materials.take(5).map((metadata) => _buildMaterialTile(context, ref, metadata)),
                if (materials.length > 5)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'E mais ${materials.length - 5} material(is)...',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => const SizedBox.shrink(),
    );
  }

  Widget _buildMaterialTile(
    BuildContext context,
    WidgetRef ref,
    OfflineMaterialMetadata metadata,
  ) {
    return ListTile(
      leading: const Icon(Icons.update, color: Colors.orange),
      title: FutureBuilder<String>(
        future: _getMaterialKindName(ref, metadata.materialKindId),
        builder: (context, snapshot) {
          return Text(snapshot.data ?? 'Material ${metadata.materialId}');
        },
      ),
      subtitle: Text('Atualização disponível'),
      trailing: ElevatedButton(
        onPressed: () => _updateMaterial(context, ref, metadata),
        child: const Text('Atualizar'),
      ),
    );
  }

  Future<String> _getMaterialKindName(WidgetRef ref, String materialKindId) async {
    try {
      return getMaterialKindName(ref, materialKindId, 'Material');
    } catch (e) {
      return 'Material';
    }
  }

  Future<void> _updateMaterial(
    BuildContext context,
    WidgetRef ref,
    OfflineMaterialMetadata metadata,
  ) async {
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: 'Atualizar Material',
      message: 'Deseja atualizar este material para a versão mais recente?',
      confirmText: 'Atualizar',
      cancelText: 'Cancelar',
    );

    if (confirmed != true) return;

    try {
      // Buscar material do backend
      final apiService = ref.read(apiServiceProvider);
      final material = await apiService.getMaterialById(metadata.materialId);

      // Atualizar material
      final downloadService = ref.read(offlineDownloadServiceProvider);
      
      // Mostrar dialog de progresso
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => _UpdateProgressDialog(
          material: material,
          downloadService: downloadService,
        ),
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao atualizar material: $e')),
        );
      }
    }
  }
}

/// Dialog de progresso durante atualização
class _UpdateProgressDialog extends ConsumerStatefulWidget {
  final dynamic material; // PraiseMaterialResponse
  final OfflineDownloadService downloadService;

  const _UpdateProgressDialog({
    required this.material,
    required this.downloadService,
  });

  @override
  ConsumerState<_UpdateProgressDialog> createState() => _UpdateProgressDialogState();
}

class _UpdateProgressDialogState extends ConsumerState<_UpdateProgressDialog> {
  double _progress = 0.0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startUpdate();
  }

  Future<void> _startUpdate() async {
    try {
      await widget.downloadService.updateMaterialOffline(
        widget.material,
        onProgress: (progress) {
          setState(() {
            _progress = progress;
          });
        },
        onError: (error) {
          setState(() {
            _error = error;
          });
        },
      );

      if (mounted) {
        // Atualizar lista de desatualizados
        ref.invalidate(outdatedMaterialsProvider);
        
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Material atualizado com sucesso')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Atualizando Material'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_error != null)
            Text(
              'Erro: $_error',
              style: const TextStyle(color: Colors.red),
            )
          else
            LinearProgressIndicator(value: _progress),
          if (_error == null) ...[
            const SizedBox(height: 8),
            Text('${(_progress * 100).toStringAsFixed(0)}%'),
          ],
        ],
      ),
      actions: [
        if (_error != null)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Fechar'),
          ),
      ],
    );
  }
}
