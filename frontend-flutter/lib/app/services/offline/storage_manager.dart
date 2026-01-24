import 'dart:io';
import 'package:path_provider/path_provider.dart';
import '../../../core/constants/app_constants.dart';

/// Gerenciador de armazenamento offline
class StorageManager {
  /// Obtém o diretório de documentos do app
  static Future<Directory> getAppDocumentsDirectory() async {
    return await getApplicationDocumentsDirectory();
  }

  /// Obtém o diretório de PDFs offline
  static Future<Directory> getOfflinePdfsDirectory() async {
    final appDir = await getAppDocumentsDirectory();
    final offlineDir = Directory('${appDir.path}/${AppConstants.offlinePdfsDir}');
    
    if (!await offlineDir.exists()) {
      await offlineDir.create(recursive: true);
    }
    
    return offlineDir;
  }

  /// Verifica espaço disponível (aproximado)
  static Future<int> getAvailableSpace() async {
    try {
      // Esta é uma aproximação - em produção, use package_info_plus ou APIs nativas
      return 1024 * 1024 * 1024; // 1GB padrão
    } catch (e) {
      return 0;
    }
  }

  /// Limpa arquivos antigos (opcional)
  static Future<void> cleanOldFiles({int daysOld = 30}) async {
    // Implementar lógica de limpeza se necessário
  }
}
