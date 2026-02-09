import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/offline/offline_metadata_service.dart';

/// Provider para informações de armazenamento
final storageInfoProvider = Provider<StorageInfo>((ref) {
  final metadataService = ref.watch(offlineMetadataServiceProvider);
  final totalSize = metadataService.getTotalSize();
  final totalCount = metadataService.getTotalCount();
  
  return StorageInfo(
    totalSize: totalSize,
    totalCount: totalCount,
  );
});

class StorageInfo {
  final int totalSize;
  final int totalCount;

  StorageInfo({
    required this.totalSize,
    required this.totalCount,
  });

  String get formattedSize {
    if (totalSize < 1024) {
      return '$totalSize B';
    } else if (totalSize < 1024 * 1024) {
      return '${(totalSize / 1024).toStringAsFixed(2)} KB';
    } else if (totalSize < 1024 * 1024 * 1024) {
      return '${(totalSize / (1024 * 1024)).toStringAsFixed(2)} MB';
    } else {
      return '${(totalSize / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
    }
  }
}

/// Widget para exibir informações de armazenamento offline
class StorageInfoWidget extends ConsumerWidget {
  final bool showAlert;

  const StorageInfoWidget({
    super.key,
    this.showAlert = true,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storageInfo = ref.watch(storageInfoProvider);

    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Armazenamento Offline',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (showAlert && _shouldShowAlert(storageInfo.totalSize))
                  Icon(
                    Icons.warning,
                    color: Colors.orange,
                    size: 20,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Espaço utilizado: ${storageInfo.formattedSize}',
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 4),
            Text(
              'Materiais offline: ${storageInfo.totalCount}',
              style: const TextStyle(fontSize: 14),
            ),
            if (showAlert && _shouldShowAlert(storageInfo.totalSize))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Espaço de armazenamento está ficando baixo. Considere limpar materiais antigos.',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.orange.shade700,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  bool _shouldShowAlert(int totalSize) {
    // Alertar se usar mais de 80% de um limite estimado (ex: 1GB)
    const estimatedLimit = 1024 * 1024 * 1024; // 1GB
    return totalSize > (estimatedLimit * 0.8);
  }
}
