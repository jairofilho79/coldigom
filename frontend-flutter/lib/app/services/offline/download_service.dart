import 'dart:io';
import 'package:background_downloader/background_downloader.dart';
import 'package:path_provider/path_provider.dart';
import '../../../core/constants/app_constants.dart';
import '../../models/praise_material_model.dart';

/// Serviço para gerenciar downloads offline de PDFs
class OfflineDownloadService {
  /// Baixa um material PDF para armazenamento offline
  Future<String> downloadMaterial(
    PraiseMaterialResponse material,
    String downloadUrl,
    Function(double progress)? onProgress,
  ) async {
    try {
      final directory = await _getOfflinePdfsDirectory();
      final fileName = '${material.id}.pdf';
      final filePath = '${directory.path}/$fileName';

      final task = DownloadTask(
        url: downloadUrl,
        filename: fileName,
        directory: directory.path,
        updates: Updates.statusAndProgress,
      );

      // Monitorar progresso via stream global
      FileDownloader().updates.listen((update) {
        if (update.task.taskId == task.taskId) {
          if (update is TaskStatusUpdate) {
            // Status atualizado
          } else if (update is TaskProgressUpdate) {
            onProgress?.call(update.progress);
          }
        }
      });

      await FileDownloader().enqueue(task);

      return filePath;
    } catch (e) {
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
}
