import 'dart:io';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:dio/dio.dart';
import '../../models/praise_material_model.dart';
import '../offline/download_service.dart';
import '../api/api_service.dart';

/// Serviço para gerenciar reprodução de áudio
class AudioPlayerService {
  final AudioPlayer _player = AudioPlayer();
  final OfflineDownloadService _downloadService;
  final ApiService _apiService;

  AudioPlayerService(this._downloadService, this._apiService);

  AudioPlayer get player => _player;

  /// Carrega um material de áudio para reprodução
  /// Verifica se está offline, se não, baixa primeiro
  Future<void> loadAudio(
    PraiseMaterialResponse material, {
    Function(double progress)? onDownloadProgress,
    Function(String? error)? onError,
  }) async {
    try {
      // Determinar extensão do arquivo
      final extension = _getAudioExtension(material.path);
      final materialId = material.id;

      // Verificar se está offline (download_service verifica apenas PDFs, então vamos tentar diretamente)
      // Para áudio, vamos sempre baixar se necessário
      String? filePath;
      
      // Tentar verificar se existe arquivo offline com extensão de áudio
      try {
        final appDir = await getApplicationDocumentsDirectory();
        final offlineDir = Directory('${appDir.path}/offline_pdfs');
        if (await offlineDir.exists()) {
          final ext = extension ?? '.mp3';
          final audioFile = File('${offlineDir.path}/$materialId$ext');
          if (await audioFile.exists()) {
            filePath = audioFile.path;
          }
        }
      } catch (e) {
        // Continuar para download
      }

      if (filePath == null || !await File(filePath).exists()) {
        // Baixar o arquivo
        onDownloadProgress?.call(0.0);

        // Obter material completo para download
        final materialFull = await _apiService.getMaterialById(materialId);

        // Usar o endpoint de download
        final response = await _apiService.dio.get<List<int>>(
          "/api/v1/praise-materials/$materialId/download",
          options: Options(
            responseType: ResponseType.bytes,
            followRedirects: true,
            validateStatus: (status) => status != null && status < 500,
          ),
          onReceiveProgress: (received, total) {
            if (total > 0) {
              final progress = received / total;
              onDownloadProgress?.call(progress);
            }
          },
        );

        if (response.statusCode != 200 || response.data == null) {
          throw Exception('Download falhou com status: ${response.statusCode}');
        }

        // Salvar arquivo no diretório offline (mesmo padrão do PDF)
        final appDir = await getApplicationDocumentsDirectory();
        final offlineDir = Directory('${appDir.path}/offline_pdfs');
        if (!await offlineDir.exists()) {
          await offlineDir.create(recursive: true);
        }
        
        final ext = extension ?? '.mp3';
        filePath = '${offlineDir.path}/$materialId$ext';
        final file = File(filePath);
        await file.writeAsBytes(response.data!);
        onDownloadProgress?.call(1.0);
      }

      if (filePath == null || !await File(filePath).exists()) {
        throw Exception('Arquivo de áudio não encontrado');
      }

      // Carregar no player
      await _player.setFilePath(filePath);
    } catch (e) {
      onError?.call(e.toString());
      rethrow;
    }
  }

  /// Obtém a extensão do arquivo de áudio baseado no path
  String? _getAudioExtension(String path) {
    final lowerPath = path.toLowerCase();
    if (lowerPath.endsWith('.mp3')) return '.mp3';
    if (lowerPath.endsWith('.wav')) return '.wav';
    if (lowerPath.endsWith('.m4a')) return '.m4a';
    if (lowerPath.endsWith('.wma')) return '.wma';
    if (lowerPath.endsWith('.aac')) return '.aac';
    if (lowerPath.endsWith('.ogg')) return '.ogg';
    return '.mp3'; // Default
  }

  /// Limpa recursos do player (para quando realmente precisar destruir)
  Future<void> dispose() async {
    await _player.stop();
    await _player.dispose();
  }
  
  /// Reseta o player sem destruir
  Future<void> reset() async {
    await _player.stop();
  }
}
