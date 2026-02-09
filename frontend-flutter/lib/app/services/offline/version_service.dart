import 'dart:io';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/offline_material_metadata.dart';
import '../../models/praise_material_model.dart';
import 'offline_metadata_service.dart';

/// Provider do serviço de versionamento
final versionServiceProvider = Provider<VersionService>((ref) {
  final metadataService = ref.read(offlineMetadataServiceProvider);
  return VersionService(metadataService);
});

/// Serviço para gerenciar versionamento de materiais offline
class VersionService {
  final OfflineMetadataService _metadataService;

  VersionService(this._metadataService);

  /// Calcula hash SHA256 de um arquivo
  Future<String> calculateFileHash(File file) async {
    try {
      final bytes = await file.readAsBytes();
      final digest = sha256.convert(bytes);
      return digest.toString();
    } catch (e) {
      throw Exception('Erro ao calcular hash do arquivo: $e');
    }
  }

  /// Compara versões locais vs remotas
  /// Retorna true se o material local está desatualizado
  bool compareVersions(
    OfflineMaterialMetadata local,
    PraiseMaterialResponse remote,
  ) {
    // Se não temos timestamp de versão local, considerar desatualizado
    if (local.versionTimestamp == null) {
      return true;
    }

    // Se o material remoto tem updated_at, comparar
    // Nota: PraiseMaterialResponse não tem updated_at diretamente,
    // mas podemos usar o hash para comparar se disponível
    // Por enquanto, vamos assumir que se o hash mudou, está desatualizado
    return false; // Implementação básica - pode ser expandida
  }

  /// Verifica se um material está desatualizado baseado no hash
  Future<bool> isOutdated(OfflineMaterialMetadata metadata) async {
    try {
      final file = File(metadata.filePath);
      if (!await file.exists()) {
        return true; // Arquivo não existe, considerar desatualizado
      }

      // Calcular hash atual do arquivo
      final currentHash = await calculateFileHash(file);

      // Se o hash mudou, está desatualizado
      if (metadata.versionHash != null && metadata.versionHash != currentHash) {
        return true;
      }

      return false;
    } catch (e) {
      return true; // Em caso de erro, considerar desatualizado
    }
  }

  /// Busca todos os materiais desatualizados
  Future<List<OfflineMaterialMetadata>> getOutdatedMaterials() async {
    final allMetadata = _metadataService.getAllMetadata();
    final outdated = <OfflineMaterialMetadata>[];

    for (final metadata in allMetadata) {
      if (await isOutdated(metadata)) {
        outdated.add(metadata);
      }
    }

    return outdated;
  }

  /// Versiona um material (calcula hash e salva nos metadados)
  Future<void> versionMaterial(String materialId, File file) async {
    try {
      final hash = await calculateFileHash(file);
      final metadata = _metadataService.getMetadata(materialId);
      
      if (metadata != null) {
        await _metadataService.updateVersion(
          materialId,
          hash,
          DateTime.now(),
        );
      }
    } catch (e) {
      throw Exception('Erro ao versionar material: $e');
    }
  }

  /// Verifica atualizações para uma lista de materiais
  /// Compara hashes locais com remotos (se disponível)
  Future<List<OfflineMaterialMetadata>> checkForUpdates(
    List<String> materialIds,
  ) async {
    final outdated = <OfflineMaterialMetadata>[];

    for (final materialId in materialIds) {
      final metadata = _metadataService.getMetadata(materialId);
      if (metadata != null && await isOutdated(metadata)) {
        outdated.add(metadata);
      }
    }

    return outdated;
  }

  /// Compara hash local com hash remoto (se fornecido)
  bool compareHashes(String? localHash, String? remoteHash) {
    if (localHash == null || remoteHash == null) {
      return false; // Não podemos comparar sem ambos os hashes
    }
    return localHash != remoteHash;
  }
}
