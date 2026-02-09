import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/offline/batch_download_service.dart';
import '../models/praise_material_model.dart';

class BatchDownloadProgressDialog extends ConsumerStatefulWidget {
  final List<String>? tagIds;
  final List<String>? materialKindIds;
  final String operation;
  final bool keepOffline;

  const BatchDownloadProgressDialog({
    super.key,
    this.tagIds,
    this.materialKindIds,
    required this.operation,
    required this.keepOffline,
  });

  @override
  ConsumerState<BatchDownloadProgressDialog> createState() =>
      _BatchDownloadProgressDialogState();
}

class _BatchDownloadProgressDialogState
    extends ConsumerState<BatchDownloadProgressDialog> {
  List<PraiseMaterialResponse> _materials = [];
  final Map<String, double> _progressMap = {};
  final Map<String, String?> _errorMap = {};
  bool _isSearching = true;
  bool _isDownloading = false;
  int _completedCount = 0;
  int _errorCount = 0;

  @override
  void initState() {
    super.initState();
    _startProcess();
  }

  Future<void> _startProcess() async {
    try {
      // Buscar materiais
      final batchService = ref.read(batchDownloadServiceProvider);
      final materials = await batchService.searchMaterials(
        tagIds: widget.tagIds,
        materialKindIds: widget.materialKindIds,
        operation: widget.operation,
      );

      setState(() {
        _materials = materials;
        _isSearching = false;
        _isDownloading = true;
      });

      // Iniciar downloads
      await batchService.downloadBatchConcurrent(
        materials,
        keepOffline: widget.keepOffline,
        maxConcurrent: 5,
        onProgress: (materialId, progress) {
          setState(() {
            _progressMap[materialId] = progress;
            if (progress >= 1.0 && !_errorMap.containsKey(materialId)) {
              _completedCount++;
            }
          });
        },
        onError: (materialId, error) {
          setState(() {
            _errorMap[materialId] = error;
            _errorCount++;
          });
        },
      );

      setState(() {
        _isDownloading = false;
      });

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Download concluído: $_completedCount sucesso, $_errorCount erros',
            ),
          ),
        );
      }
    } catch (e) {
      setState(() {
        _isSearching = false;
        _isDownloading = false;
      });

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Download em Lote'),
      content: Container(
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 400),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_isSearching)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              )
            else ...[
              // Progresso geral
              LinearProgressIndicator(
                value: _materials.isEmpty
                    ? 0.0
                    : (_completedCount + _errorCount) / _materials.length,
              ),
              const SizedBox(height: 8),
              Text(
                '${_completedCount + _errorCount} de ${_materials.length} arquivos',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (_errorCount > 0)
                Text(
                  'Erros: $_errorCount',
                  style: TextStyle(color: Colors.red),
                ),
              const SizedBox(height: 16),
              
              // Lista de arquivos (limitada a 10 primeiros)
              Expanded(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _materials.length > 10 ? 10 : _materials.length,
                  itemBuilder: (context, index) {
                    final material = _materials[index];
                    final progress = _progressMap[material.id] ?? 0.0;
                    final error = _errorMap[material.id];
                    
                    return ListTile(
                      dense: true,
                      title: Text(
                        material.materialKind?.name ?? 'Material',
                        style: TextStyle(fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: error != null
                          ? const Icon(Icons.error, color: Colors.red, size: 16)
                          : progress >= 1.0
                              ? const Icon(Icons.check, color: Colors.green, size: 16)
                              : SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    value: progress,
                                    strokeWidth: 2,
                                  ),
                                ),
                    );
                  },
                ),
              ),
              if (_materials.length > 10)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'E mais ${_materials.length - 10} arquivos...',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ),
            ],
          ],
        ),
      ),
      actions: [
        if (!_isSearching && !_isDownloading)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Fechar'),
          ),
      ],
    );
  }
}
