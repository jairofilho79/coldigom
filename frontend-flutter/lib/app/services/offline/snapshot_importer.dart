import 'dart:io';
import 'dart:convert';
import 'package:archive/archive.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'snapshot_validator.dart';
import 'offline_metadata_service.dart';
import 'download_service.dart';
import 'version_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/offline_material_metadata.dart';
import '../../../core/constants/app_constants.dart';

/// Provider do serviço de importação de snapshot
final snapshotImporterProvider = Provider<SnapshotImporter>((ref) {
  final versionService = ref.read(versionServiceProvider);
  final validator = SnapshotValidator(versionService);
  final metadataService = ref.read(offlineMetadataServiceProvider);
  final downloadService = ref.read(offlineDownloadServiceProvider);
  return SnapshotImporter(validator, metadataService, downloadService);
});

/// Serviço para importar snapshot de flash drive (UC-145, UC-146)
class SnapshotImporter {
  final SnapshotValidator _validator;
  final OfflineMetadataService _metadataService;
  final OfflineDownloadService _downloadService;

  SnapshotImporter(
    this._validator,
    this._metadataService,
    this._downloadService,
  );

  /// Importa snapshot via file picker (UC-145)
  Future<SnapshotImportResult> importSnapshot({
    Function(double progress)? onProgress,
    Function(String message)? onMessage,
  }) async {
    try {
      onProgress?.call(0.0);
      onMessage?.call('Selecionando arquivo...');

      // Selecionar arquivo ZIP
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['zip'],
      );

      if (result == null || result.files.single.path == null) {
        return SnapshotImportResult(
          success: false,
          error: 'Nenhum arquivo selecionado',
        );
      }

      final zipFile = File(result.files.single.path!);
      onProgress?.call(0.1);
      onMessage?.call('Validando snapshot...');

      // Obter versão da aplicação
      final packageInfo = await PackageInfo.fromPlatform();
      final currentAppVersion = packageInfo.version;

      // Validar snapshot
      final validation = await _validator.validateSnapshot(zipFile, currentAppVersion);
      if (!validation.valid) {
        return SnapshotImportResult(
          success: false,
          error: 'Snapshot inválido: ${validation.errors.join(", ")}',
          warnings: validation.warnings,
        );
      }

      onProgress?.call(0.2);
      onMessage?.call('Extraindo arquivos...');

      // Extrair arquivos do ZIP
      await _extractFiles(zipFile, validation.manifest!, (progress) {
        onProgress?.call(0.2 + (progress * 0.4));
      });

      onProgress?.call(0.6);
      onMessage?.call('Importando metadados...');

      // Importar metadados
      await _importMetadata(zipFile, validation.manifest!, (progress) {
        onProgress?.call(0.6 + (progress * 0.3));
      });

      onProgress?.call(0.9);
      onMessage?.call('Finalizando...');

      // Processar snapshot
      await _processSnapshot(validation.manifest!);

      onProgress?.call(1.0);
      onMessage?.call('Importação concluída!');

      return SnapshotImportResult(
        success: true,
        materialsImported: validation.manifest!.metadata.materialsCount,
        praisesImported: validation.manifest!.metadata.praisesCount,
        warnings: validation.warnings,
      );
    } catch (e) {
      return SnapshotImportResult(
        success: false,
        error: e.toString(),
      );
    }
  }

  /// Extrai arquivos do ZIP
  Future<void> _extractFiles(
    File zipFile,
    SnapshotManifest manifest,
    Function(double progress) onProgress,
  ) async {
    final bytes = await zipFile.readAsBytes();
    final archive = ZipDecoder().decodeBytes(bytes);

    final directory = await _getOfflinePdfsDirectory();
    int extracted = 0;

    for (final file in archive.files) {
      if (file.name.startsWith('materials/')) {
        // Extrair arquivo de material
        final fileName = file.name.split('/').last;
        final materialId = fileName.split('.').first; // Assumir formato: materialId.ext

        final outputFile = File('${directory.path}/$fileName');
        await outputFile.create(recursive: true);
        await outputFile.writeAsBytes(file.content as List<int>);

        extracted++;
        onProgress(extracted / manifest.files.length);
      }
    }
  }

  /// Importa metadados do snapshot
  Future<void> _importMetadata(
    File zipFile,
    SnapshotManifest manifest,
    Function(double progress) onProgress,
  ) async {
    final bytes = await zipFile.readAsBytes();
    final archive = ZipDecoder().decodeBytes(bytes);

    // Ler metadados de praises, tags, etc.
    // Por enquanto, apenas processar arquivos de materiais
    // TODO: Importar metadados completos quando backend estiver pronto

    onProgress(1.0);
  }

  /// Processa snapshot importado
  Future<void> _processSnapshot(SnapshotManifest manifest) async {
    // Criar metadados para materiais importados
    final directory = await _getOfflinePdfsDirectory();
    final files = directory.listSync();

    for (final file in files) {
      if (file is File) {
        final fileName = file.path.split('/').last;
        final materialId = fileName.split('.').first;

        // Verificar se já existe metadado
        final existing = _metadataService.getMetadata(materialId);
        if (existing != null) continue;

        // Criar metadado básico
        // Nota: Informações completas viriam do manifest ou metadados do snapshot
        final fileSize = await file.length();
        final metadata = OfflineMaterialMetadata(
          materialId: materialId,
          praiseId: 'unknown', // Será atualizado quando metadados completos forem importados
          materialKindId: 'unknown',
          materialTypeId: 'unknown',
          fileName: fileName,
          filePath: file.path,
          fileSize: fileSize,
          downloadedAt: DateTime.now(),
          isKeptOffline: false,
        );

        await _metadataService.saveMetadata(metadata);
      }
    }
  }

  Future<Directory> _getOfflinePdfsDirectory() async {
    final appDocDir = await getApplicationDocumentsDirectory();
    return Directory('${appDocDir.path}/${AppConstants.offlinePdfsDir}');
  }
}

class SnapshotImportResult {
  final bool success;
  final String? error;
  final int? materialsImported;
  final int? praisesImported;
  final List<String> warnings;

  SnapshotImportResult({
    required this.success,
    this.error,
    this.materialsImported,
    this.praisesImported,
    this.warnings = const [],
  });
}
