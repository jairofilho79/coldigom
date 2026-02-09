import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/offline_material_metadata.dart';
import '../services/offline/offline_metadata_service.dart';
import '../services/offline/version_service.dart';
import '../services/offline/download_service.dart';

/// Widget para indicar status visual de um material
/// Exibe: online, offline temporário, mantido offline, desatualizado
class MaterialStatusIndicator extends ConsumerWidget {
  final String materialId;
  final double? size;

  const MaterialStatusIndicator({
    super.key,
    required this.materialId,
    this.size = 16.0,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final metadataService = ref.watch(offlineMetadataServiceProvider);
    final downloadService = ref.watch(offlineDownloadServiceProvider);
    final versionService = ref.watch(versionServiceProvider);

    // Verificar se está offline
    return FutureBuilder<bool>(
      future: downloadService.isMaterialOffline(materialId),
      builder: (context, offlineSnapshot) {
        if (!offlineSnapshot.hasData) {
          return const SizedBox.shrink();
        }

        final isOffline = offlineSnapshot.data ?? false;
        if (!isOffline) {
          // Online - sem ícone
          return const SizedBox.shrink();
        }

        // Está offline, verificar metadados
        final metadata = metadataService.getMetadata(materialId);
        if (metadata == null) {
          // Offline temporário (sem metadados)
          return _buildIcon(
            icon: Icons.download,
            color: Colors.blue,
            tooltip: 'Offline Temporário',
          );
        }

        // Verificar se está desatualizado
        return FutureBuilder<bool>(
          future: versionService.isOutdated(metadata),
          builder: (context, outdatedSnapshot) {
            final isOutdated = outdatedSnapshot.data ?? false;

            if (isOutdated) {
              // Desatualizado
              return _buildIcon(
                icon: Icons.update,
                color: Colors.orange,
                tooltip: 'Atualização Disponível',
              );
            }

            if (metadata.isKeptOffline) {
              // Mantido offline
              return _buildIcon(
                icon: Icons.offline_pin,
                color: Colors.green,
                tooltip: 'Mantido Offline',
              );
            }

            // Offline temporário (com metadados mas não kept)
            return _buildIcon(
              icon: Icons.download,
              color: Colors.blue,
              tooltip: 'Offline Temporário',
            );
          },
        );
      },
    );
  }

  Widget _buildIcon({
    required IconData icon,
    required Color color,
    required String tooltip,
  }) {
    return Tooltip(
      message: tooltip,
      child: Icon(
        icon,
        size: size,
        color: color,
      ),
    );
  }
}

/// Widget compacto para exibir apenas badge de status
class MaterialStatusBadge extends ConsumerWidget {
  final String materialId;

  const MaterialStatusBadge({
    super.key,
    required this.materialId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final metadataService = ref.watch(offlineMetadataServiceProvider);
    final downloadService = ref.watch(offlineDownloadServiceProvider);
    final versionService = ref.watch(versionServiceProvider);

    return FutureBuilder<bool>(
      future: downloadService.isMaterialOffline(materialId),
      builder: (context, offlineSnapshot) {
        if (!offlineSnapshot.hasData) {
          return const SizedBox.shrink();
        }

        final isOffline = offlineSnapshot.data ?? false;
        if (!isOffline) {
          return const SizedBox.shrink();
        }

        final metadata = metadataService.getMetadata(materialId);
        if (metadata == null) {
          return _buildBadge(
            label: 'Temp',
            color: Colors.blue,
            tooltip: 'Offline Temporário',
          );
        }

        return FutureBuilder<bool>(
          future: versionService.isOutdated(metadata),
          builder: (context, outdatedSnapshot) {
            final isOutdated = outdatedSnapshot.data ?? false;

            if (isOutdated) {
              return _buildBadge(
                label: 'Atualizar',
                color: Colors.orange,
                tooltip: 'Atualização Disponível',
              );
            }

            if (metadata.isKeptOffline) {
              return _buildBadge(
                label: 'Offline',
                color: Colors.green,
                tooltip: 'Mantido Offline',
              );
            }

            return _buildBadge(
              label: 'Temp',
              color: Colors.blue,
              tooltip: 'Offline Temporário',
            );
          },
        );
      },
    );
  }

  Widget _buildBadge({
    required String label,
    required Color color,
    required String tooltip,
  }) {
    return Tooltip(
      message: tooltip,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: color, width: 1),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 10,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }
}
