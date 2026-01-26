import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../../../core/constants/app_constants.dart';
import '../../models/praise_material_model.dart';
import '../api/api_service.dart';

/// Provider do serviço de download offline
final offlineDownloadServiceProvider = Provider<OfflineDownloadService>((ref) {
  final apiService = ref.read(apiServiceProvider);
  return OfflineDownloadService(apiService);
});

/// Serviço para gerenciar downloads offline de PDFs
class OfflineDownloadService {
  final ApiService _apiService;

  OfflineDownloadService(this._apiService);

  /// Baixa um material PDF para armazenamento offline
  /// Usa o endpoint /download diretamente (igual ao frontend React)
  Future<String> downloadMaterial(
    PraiseMaterialResponse material,
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  ) async {
    try {
      final directory = await _getOfflinePdfsDirectory();
      final fileName = '${material.id}.pdf';
      final filePath = '${directory.path}/$fileName';

      // Se o arquivo já existe, retornar imediatamente
      final existingFile = File(filePath);
      if (await existingFile.exists()) {
        onProgress?.call(1.0);
        return filePath;
      }

      onProgress?.call(0.1);

      // Usar o endpoint /download diretamente (igual ao frontend React)
      // Este endpoint já trata autenticação e redireciona para URL assinada se necessário
      final response = await _apiService.dio.get<List<int>>(
        "/api/v1/praise-materials/${material.id}/download",
        options: Options(
          responseType: ResponseType.bytes,
          followRedirects: true,
          validateStatus: (status) => status != null && status < 500,
        ),
        onReceiveProgress: (received, total) {
          if (total > 0) {
            final progress = 0.1 + (received / total) * 0.9;
            onProgress?.call(progress);
          }
        },
      );

      if (response.statusCode == 200 && response.data != null) {
        // Salvar arquivo
        final file = File(filePath);
        await file.writeAsBytes(response.data!);
        onProgress?.call(1.0);
        return filePath;
      } else {
        throw Exception('Download falhou com status: ${response.statusCode}');
      }
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao baixar material: $e');
    }
  }

  /// Verifica se um material está disponível offline
  Future<bool> isMaterialOffline(String materialId) async {
    try {
      final directory = await _getOfflinePdfsDirectory();
      final file = File('${directory.path}/$materialId.pdf');
      return await file.exists();
    } catch (e) {
      return false;
    }
  }

  /// Obtém o caminho do arquivo offline se existir
  Future<String?> getOfflineFilePath(String materialId) async {
    try {
      final directory = await _getOfflinePdfsDirectory();
      final file = File('${directory.path}/$materialId.pdf');
      if (await file.exists()) {
        return file.path;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /// Remove um material offline
  Future<void> removeOfflineMaterial(String materialId) async {
    try {
      final directory = await _getOfflinePdfsDirectory();
      final file = File('${directory.path}/$materialId.pdf');
      if (await file.exists()) {
        await file.delete();
      }
    } catch (e) {
      throw Exception('Erro ao remover material offline: $e');
    }
  }

  /// Lista todos os materiais offline
  Future<List<String>> listOfflineMaterials() async {
    try {
      final directory = await _getOfflinePdfsDirectory();
      final files = directory.listSync();
      return files
          .whereType<File>()
          .where((file) => file.path.endsWith('.pdf'))
          .map((file) => file.path.split('/').last.replaceAll('.pdf', ''))
          .toList();
    } catch (e) {
      return [];
    }
  }

  /// Obtém o diretório de PDFs offline
  Future<Directory> _getOfflinePdfsDirectory() async {
    final appDir = await getApplicationDocumentsDirectory();
    final offlineDir = Directory('${appDir.path}/${AppConstants.offlinePdfsDir}');
    
    if (!await offlineDir.exists()) {
      await offlineDir.create(recursive: true);
    }
    
    return offlineDir;
  }

  /// Obtém o tamanho total dos arquivos offline
  Future<int> getOfflineStorageSize() async {
    try {
      final directory = await _getOfflinePdfsDirectory();
      final files = directory.listSync().whereType<File>();
      int totalSize = 0;
      
      for (final file in files) {
        totalSize += await file.length();
      }
      
      return totalSize;
    } catch (e) {
      return 0;
    }
  }

  /// Baixa um praise completo em ZIP
  /// Permite ao usuário escolher onde salvar usando file picker
  Future<String?> downloadPraiseZip(
    String praiseId,
    String praiseName, {
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  }) async {
    try {
      // Primeiro, baixar os dados do ZIP
      onProgress?.call(0.1);
      final response = await _apiService.downloadPraiseZip(praiseId);
      
      if (response.statusCode != 200) {
        throw Exception('Erro ao baixar ZIP: ${response.statusCode}');
      }

      if (response.data is! Uint8List) {
        throw Exception('Formato de resposta inválido');
      }

      onProgress?.call(0.5);

      // Preparar nome do arquivo sugerido
      final safeName = praiseName.replaceAll(RegExp(r'[^\w\s-]'), '_');
      final suggestedFileName = '${safeName}_${praiseId.substring(0, 8)}.zip';

      // Permitir ao usuário escolher onde salvar
      final String? savePath = await FilePicker.platform.saveFile(
        dialogTitle: 'Salvar ZIP do Praise',
        fileName: suggestedFileName,
        type: FileType.custom,
        allowedExtensions: ['zip'],
      );

      if (savePath == null) {
        // Usuário cancelou
        return null;
      }

      onProgress?.call(0.8);

      // Salvar bytes no arquivo escolhido pelo usuário
      final file = File(savePath);
      await file.writeAsBytes(response.data as Uint8List);
      
      onProgress?.call(1.0);
      return file.path;
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao baixar ZIP do praise: $e');
    }
  }

  /// Baixa materiais por Material Kind em ZIP
  /// Permite ao usuário escolher onde salvar usando file picker
  Future<String?> downloadByMaterialKind(
    String materialKindId,
    String materialKindName, {
    String? tagId,
    int? maxZipSizeMb,
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  }) async {
    try {
      // Primeiro, baixar os dados do ZIP
      onProgress?.call(0.1);
      final response = await _apiService.downloadByMaterialKind(
        materialKindId,
        tagId: tagId,
        maxZipSizeMb: maxZipSizeMb,
      );
      
      if (response.statusCode != 200) {
        throw Exception('Erro ao baixar ZIP: ${response.statusCode}');
      }

      if (response.data is! Uint8List) {
        throw Exception('Formato de resposta inválido');
      }

      onProgress?.call(0.5);

      // Preparar nome do arquivo sugerido
      final safeName = materialKindName.replaceAll(RegExp(r'[^\w\s-]'), '_');
      final suggestedFileName = 'materials_${safeName}_${materialKindId.substring(0, 8)}.zip';

      // Permitir ao usuário escolher onde salvar
      final String? savePath = await FilePicker.platform.saveFile(
        dialogTitle: 'Salvar ZIP de Materiais',
        fileName: suggestedFileName,
        type: FileType.custom,
        allowedExtensions: ['zip'],
      );

      if (savePath == null) {
        // Usuário cancelou
        return null;
      }

      onProgress?.call(0.8);

      // Salvar bytes no arquivo escolhido pelo usuário
      final file = File(savePath);
      await file.writeAsBytes(response.data as Uint8List);
      
      onProgress?.call(1.0);
      return file.path;
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao baixar ZIP por Material Kind: $e');
    }
  }
}
