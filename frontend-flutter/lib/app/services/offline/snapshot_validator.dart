import 'dart:io';
import 'dart:convert';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'version_service.dart';

/// Modelo para manifest.json do snapshot
class SnapshotManifest {
  final String version;
  final String appVersion;
  final DateTime createdAt;
  final List<SnapshotFileInfo> files;
  final SnapshotMetadata metadata;

  SnapshotManifest({
    required this.version,
    required this.appVersion,
    required this.createdAt,
    required this.files,
    required this.metadata,
  });

  factory SnapshotManifest.fromJson(Map<String, dynamic> json) {
    return SnapshotManifest(
      version: json['version'] as String,
      appVersion: json['app_version'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      files: (json['files'] as List)
          .map((f) => SnapshotFileInfo.fromJson(f as Map<String, dynamic>))
          .toList(),
      metadata: SnapshotMetadata.fromJson(json['metadata'] as Map<String, dynamic>),
    );
  }
}

class SnapshotFileInfo {
  final String path;
  final String hash;
  final int size;

  SnapshotFileInfo({
    required this.path,
    required this.hash,
    required this.size,
  });

  factory SnapshotFileInfo.fromJson(Map<String, dynamic> json) {
    return SnapshotFileInfo(
      path: json['path'] as String,
      hash: json['hash'] as String,
      size: json['size'] as int,
    );
  }
}

class SnapshotMetadata {
  final int praisesCount;
  final int materialsCount;

  SnapshotMetadata({
    required this.praisesCount,
    required this.materialsCount,
  });

  factory SnapshotMetadata.fromJson(Map<String, dynamic> json) {
    return SnapshotMetadata(
      praisesCount: json['praises_count'] as int,
      materialsCount: json['materials_count'] as int,
    );
  }
}

/// Serviço para validar integridade de snapshot (UC-144, UC-148)
class SnapshotValidator {
  final VersionService _versionService;

  SnapshotValidator(this._versionService);

  /// Valida assinatura digital do snapshot (UC-144)
  /// Nota: Implementação básica - requer backend para validação completa
  Future<bool> validateSnapshotSignature(File zipFile) async {
    try {
      // Por enquanto, apenas verifica se o arquivo existe
      // Em produção, validaria assinatura digital usando chave pública
      if (!await zipFile.exists()) {
        return false;
      }
      
      // TODO: Implementar validação de assinatura digital quando backend estiver pronto
      // Verificar se existe signature.pem no ZIP e validar com chave pública
      
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Valida hashes SHA256 de cada arquivo (UC-144)
  Future<bool> validateFileHashes(File zipFile, SnapshotManifest manifest) async {
    try {
      final bytes = await zipFile.readAsBytes();
      final archive = ZipDecoder().decodeBytes(bytes);

      for (final fileInfo in manifest.files) {
        final file = archive.findFile(fileInfo.path);
        if (file == null) {
          return false; // Arquivo não encontrado no ZIP
        }

        // Calcular hash do arquivo
        final fileBytes = file.content as List<int>;
        final digest = sha256.convert(fileBytes);
        final calculatedHash = digest.toString();

        // Comparar com hash do manifest
        if (calculatedHash != fileInfo.hash) {
          return false; // Hash não confere
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /// Valida estrutura de diretórios do snapshot (UC-144)
  Future<bool> validateStructure(File zipFile) async {
    try {
      final bytes = await zipFile.readAsBytes();
      final archive = ZipDecoder().decodeBytes(bytes);

      // Verificar se existe manifest.json
      final manifestFile = archive.findFile('manifest.json');
      if (manifestFile == null) {
        return false;
      }

      // Verificar se existe pasta metadata/
      final hasMetadata = archive.files.any((f) => f.name.startsWith('metadata/'));
      if (!hasMetadata) {
        return false;
      }

      // Verificar se existe pasta materials/
      final hasMaterials = archive.files.any((f) => f.name.startsWith('materials/'));
      if (!hasMaterials) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /// Valida formato do manifest.json (UC-144, UC-148)
  Future<SnapshotManifest?> validateManifestFormat(File zipFile) async {
    try {
      final bytes = await zipFile.readAsBytes();
      final archive = ZipDecoder().decodeBytes(bytes);

      final manifestFile = archive.findFile('manifest.json');
      if (manifestFile == null) {
        return null;
      }

      final manifestContent = utf8.decode(manifestFile.content as List<int>);
      final manifestJson = jsonDecode(manifestContent) as Map<String, dynamic>;

      // Validar campos obrigatórios
      if (!manifestJson.containsKey('version') ||
          !manifestJson.containsKey('app_version') ||
          !manifestJson.containsKey('created_at') ||
          !manifestJson.containsKey('files') ||
          !manifestJson.containsKey('metadata')) {
        return null;
      }

      return SnapshotManifest.fromJson(manifestJson);
    } catch (e) {
      return null;
    }
  }

  /// Verifica compatibilidade de snapshot (UC-148)
  Future<bool> checkCompatibility(SnapshotManifest manifest, String currentAppVersion) async {
    // Verificar versão do snapshot
    if (manifest.version != '1.0.0') {
      return false; // Versão não suportada
    }

    // Verificar versão da aplicação (pode ser mais flexível)
    // Por enquanto, aceita qualquer versão
    return true;
  }

  /// Validação completa do snapshot
  Future<SnapshotValidationResult> validateSnapshot(File zipFile, String currentAppVersion) async {
    final result = SnapshotValidationResult();

    // Validar estrutura
    result.structureValid = await validateStructure(zipFile);
    if (!result.structureValid) {
      result.errors.add('Estrutura de diretórios inválida');
      return result;
    }

    // Validar formato do manifest
    final manifest = await validateManifestFormat(zipFile);
    if (manifest == null) {
      result.errors.add('Formato do manifest.json inválido');
      return result;
    }
    result.manifest = manifest;

    // Verificar compatibilidade
    result.compatible = await checkCompatibility(manifest, currentAppVersion);
    if (!result.compatible) {
      result.errors.add('Snapshot incompatível com a versão atual da aplicação');
      return result;
    }

    // Validar assinatura (se disponível)
    result.signatureValid = await validateSnapshotSignature(zipFile);
    if (!result.signatureValid) {
      result.warnings.add('Assinatura digital não pôde ser validada');
    }

    // Validar hashes
    result.hashesValid = await validateFileHashes(zipFile, manifest);
    if (!result.hashesValid) {
      result.errors.add('Hashes de arquivos não conferem');
      return result;
    }

    result.valid = true;
    return result;
  }
}

class SnapshotValidationResult {
  bool valid = false;
  bool structureValid = false;
  bool signatureValid = false;
  bool hashesValid = false;
  bool compatible = false;
  SnapshotManifest? manifest;
  final List<String> errors = [];
  final List<String> warnings = [];
}
