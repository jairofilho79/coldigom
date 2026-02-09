import 'dart:io';
import 'dart:typed_data';
import 'dart:async';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../../../core/constants/app_constants.dart';
import '../../models/praise_material_model.dart';
import '../../models/offline_material_metadata.dart';
import '../api/api_service.dart';
import 'offline_metadata_service.dart';
import 'version_service.dart';

/// Provider do serviço de download offline
final offlineDownloadServiceProvider = Provider<OfflineDownloadService>((ref) {
  final apiService = ref.read(apiServiceProvider);
  final downloadService = OfflineDownloadService(apiService);
  
  // Inicializar serviços de metadados e versionamento
  final metadataService = ref.read(offlineMetadataServiceProvider);
  final versionService = ref.read(versionServiceProvider);
  downloadService.initializeServices(metadataService, versionService);
  
  return downloadService;
});

/// Cache entry para URLs temporárias
class _UrlCacheEntry {
  final String url;
  final DateTime expiresAt;

  _UrlCacheEntry(this.url, this.expiresAt);

  bool get isValid => DateTime.now().isBefore(expiresAt);
}

/// Serviço para gerenciar downloads offline de PDFs
class OfflineDownloadService {
  final ApiService _apiService;
  OfflineMetadataService? _metadataService;
  VersionService? _versionService;
  
  // Cache de URLs temporárias em memória
  final Map<String, _UrlCacheEntry> _urlCache = {};
  
  // Semáforo para controlar downloads paralelos
  final int _maxConcurrentDownloads = 5;
  int _activeDownloads = 0;
  final List<Completer<void>> _downloadQueue = [];

  OfflineDownloadService(this._apiService);

  /// Inicializa serviços de metadados e versionamento (opcional)
  void initializeServices(OfflineMetadataService metadataService, VersionService versionService) {
    _metadataService = metadataService;
    _versionService = versionService;
  }
  
  /// Limpa o cache de URLs (chamado ao fazer logout)
  void clearUrlCache() {
    _urlCache.clear();
  }
  
  /// Obtém URL temporária com cache
  Future<String> _getDownloadUrl(String materialId, {int expiration = 3600}) async {
    // Verificar cache
    final cached = _urlCache[materialId];
    if (cached != null && cached.isValid) {
      // Cache válido - invalidar se restam menos de 10 minutos (50min de 1h usado)
      final timeUntilExpiry = cached.expiresAt.difference(DateTime.now());
      if (timeUntilExpiry.inMinutes >= 10) {
        return cached.url;
      }
    }
    
    // Obter nova URL
    try {
      final response = await _apiService.getDownloadUrl(materialId, expiration: expiration);
      final expiresAt = DateTime.now().add(Duration(seconds: response.expiresIn));
      
      // Armazenar no cache
      _urlCache[materialId] = _UrlCacheEntry(response.downloadUrl, expiresAt);
      
      return response.downloadUrl;
    } catch (e) {
      throw Exception('Erro ao obter URL de download: $e');
    }
  }
  
  /// Detecta se a URL é do Wasabi (HTTPS) ou Local (relativa)
  bool _isWasabiUrl(String url) {
    return url.startsWith('https://');
  }
  
  /// Converte URL relativa para absoluta (storage local)
  String _makeAbsoluteUrl(String relativeUrl) {
    if (relativeUrl.startsWith('/')) {
      return '${AppConstants.apiBaseUrl}$relativeUrl';
    }
    return relativeUrl;
  }
  
  /// Aguarda slot disponível para download
  Future<void> _waitForDownloadSlot() async {
    if (_activeDownloads < _maxConcurrentDownloads) {
      _activeDownloads++;
      return;
    }
    
    final completer = Completer<void>();
    _downloadQueue.add(completer);
    await completer.future;
  }
  
  /// Libera slot de download
  void _releaseDownloadSlot() {
    _activeDownloads--;
    if (_downloadQueue.isNotEmpty) {
      final next = _downloadQueue.removeAt(0);
      _activeDownloads++;
      next.complete();
    }
  }
  
  /// Baixa arquivo de uma URL com retry
  Future<Uint8List> _downloadFromUrl(
    String url,
    Function(double progress)? onProgress, {
    int maxRetries = 3,
  }) async {
    int attempt = 0;
    Exception? lastError;
    
    while (attempt < maxRetries) {
      try {
        // Converter URL relativa para absoluta se necessário
        final downloadUrl = _isWasabiUrl(url) ? url : _makeAbsoluteUrl(url);
        
        final dio = Dio();
        final response = await dio.get<List<int>>(
          downloadUrl,
          options: Options(
            responseType: ResponseType.bytes,
            followRedirects: true,
            validateStatus: (status) => status != null && status < 500,
          ),
          onReceiveProgress: (received, total) {
            if (total > 0) {
              onProgress?.call(received / total);
            }
          },
        );
        
        if (response.statusCode == 200 && response.data != null) {
          return Uint8List.fromList(response.data!);
        } else if (response.statusCode == 403 || response.statusCode == 404) {
          // URL expirada ou não encontrada - não tentar novamente
          throw Exception('URL inválida ou expirada: ${response.statusCode}');
        } else {
          throw Exception('Download falhou com status: ${response.statusCode}');
        }
      } catch (e) {
        lastError = e is Exception ? e : Exception(e.toString());
        attempt++;
        
        if (attempt < maxRetries) {
          // Backoff exponencial: 1s, 2s, 4s
          final delay = Duration(seconds: 1 << (attempt - 1));
          await Future.delayed(delay);
        }
      }
    }
    
    throw lastError ?? Exception('Falha ao baixar após $maxRetries tentativas');
  }
  
  /// Baixa material usando URL temporária (otimizado)
  /// Para URLs do Wasabi (HTTPS), faz download direto da URL assinada
  /// Para URLs locais (relativas), usa o endpoint /download do backend
  Future<String> downloadMaterialFromUrl(
    String materialId, {
    Function(double progress)? onProgress,
    Function(String? error)? onError,
    int maxRetries = 3,
    int expiration = 3600,
  }) async {
    try {
      final directory = await _getOfflinePdfsDirectory();
      final fileName = '$materialId.pdf';
      final filePath = '${directory.path}/$fileName';

      // Se o arquivo já existe, retornar imediatamente
      final existingFile = File(filePath);
      if (await existingFile.exists()) {
        onProgress?.call(1.0);
        return filePath;
      }

      onProgress?.call(0.05);

      // Obter URL temporária
      final url = await _getDownloadUrl(materialId, expiration: expiration);
      
      // Se for URL local (relativa), usar o endpoint /download diretamente
      // porque os assets são servidos pelo Nginx em porta diferente do backend
      if (!_isWasabiUrl(url)) {
        // Usar endpoint /download diretamente para storage local
        return await _downloadViaEndpoint(materialId, filePath, onProgress, onError);
      }
      
      onProgress?.call(0.1);

      // Para Wasabi, fazer download direto da URL assinada
      await _waitForDownloadSlot();
      
      try {
        // Download do arquivo
        final bytes = await _downloadFromUrl(
          url,
          (progress) {
            // Progresso de 0.1 a 0.95
            onProgress?.call(0.1 + (progress * 0.85));
          },
          maxRetries: maxRetries,
        );

        // Salvar arquivo
        final file = File(filePath);
        await file.writeAsBytes(bytes);
        
        // Salvar metadados se serviço estiver disponível
        // Nota: Precisamos do material completo para salvar metadados
        // Por enquanto, vamos salvar apenas o básico
        
        onProgress?.call(1.0);
        return filePath;
      } finally {
        _releaseDownloadSlot();
      }
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao baixar material: $e');
    }
  }
  
  /// Baixa material usando o endpoint /download diretamente (para storage local)
  Future<String> _downloadViaEndpoint(
    String materialId,
    String filePath,
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  ) async {
    onProgress?.call(0.1);
    
    await _waitForDownloadSlot();
    
    try {
      final response = await _apiService.dio.get<List<int>>(
        "/api/v1/praise-materials/$materialId/download",
        options: Options(
          responseType: ResponseType.bytes,
          followRedirects: true,
          validateStatus: (status) => status != null && status < 500,
        ),
        onReceiveProgress: (received, total) {
          if (total > 0) {
            final progress = 0.1 + (received / total) * 0.85;
            onProgress?.call(progress);
          }
        },
      );
      
      if (response.statusCode == 200 && response.data != null) {
        final file = File(filePath);
        await file.writeAsBytes(response.data!);
        onProgress?.call(1.0);
        return filePath;
      } else {
        throw Exception('Download falhou com status: ${response.statusCode}');
      }
    } finally {
      _releaseDownloadSlot();
    }
  }
  
  /// Baixa múltiplos materiais em paralelo
  Future<Map<String, String>> downloadMaterialsBatch(
    List<String> materialIds, {
    Function(String materialId, double progress)? onProgress,
    Function(String materialId, String? error)? onError,
    int maxConcurrent = 5,
    int expiration = 3600,
  }) async {
    final results = <String, String>{};
    final errors = <String, String>{};
    
    // Obter todas as URLs em paralelo
    final urlFutures = materialIds.map((id) async {
      try {
        final url = await _getDownloadUrl(id, expiration: expiration);
        return MapEntry(id, url);
      } catch (e) {
        onError?.call(id, 'Erro ao obter URL: $e');
        errors[id] = e.toString();
        return null;
      }
    });
    
    final urlMap = <String, String>{};
    final urlResults = await Future.wait(urlFutures);
    for (final entry in urlResults) {
      if (entry != null) {
        urlMap[entry.key] = entry.value;
      }
    }
    
    // Downloads paralelos com controle de concorrência
    final downloadFutures = urlMap.entries.map((entry) async {
      final materialId = entry.key;
      final url = entry.value;
      
      try {
        await _waitForDownloadSlot();
        
        try {
          final directory = await _getOfflinePdfsDirectory();
          final fileName = '$materialId.pdf';
          final filePath = '${directory.path}/$fileName';
          
          // Verificar se já existe
          final existingFile = File(filePath);
          if (await existingFile.exists()) {
            onProgress?.call(materialId, 1.0);
            results[materialId] = filePath;
            return;
          }
          
          // Download
          final bytes = await _downloadFromUrl(
            url,
            (progress) => onProgress?.call(materialId, progress),
            maxRetries: 3,
          );
          
          // Salvar
          final file = File(filePath);
          await file.writeAsBytes(bytes);
          
          // Metadados serão salvos quando necessário (via keepMaterialOffline ou downloadMaterial)
          
          results[materialId] = filePath;
          onProgress?.call(materialId, 1.0);
        } finally {
          _releaseDownloadSlot();
        }
      } catch (e) {
        onError?.call(materialId, e.toString());
        errors[materialId] = e.toString();
      }
    });
    
    await Future.wait(downloadFutures);
    
    if (errors.isNotEmpty && results.isEmpty) {
      throw Exception('Falha ao baixar todos os materiais: ${errors.values.join(", ")}');
    }
    
    return results;
  }

  /// Baixa um material PDF para armazenamento offline
  /// Usa URL temporária quando disponível, com fallback para /download
  Future<String> downloadMaterial(
    PraiseMaterialResponse material,
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  ) async {
    try {
      // Tentar usar URL temporária primeiro (mais eficiente)
      try {
        return await downloadMaterialFromUrl(
          material.id,
          onProgress: onProgress,
          onError: onError,
        );
      } catch (urlError) {
        // Fallback para endpoint /download se URL temporária falhar
        // Isso garante compatibilidade e funciona mesmo se o endpoint de URL não estiver disponível
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

          // Usar o endpoint /download diretamente como fallback
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
            
            // Salvar metadados se serviço estiver disponível
            await _saveMetadataAfterDownload(material, filePath, file);
            
            onProgress?.call(1.0);
            return filePath;
          } else {
            throw Exception('Download falhou com status: ${response.statusCode}');
          }
        } catch (fallbackError) {
          // Se ambos falharem, reportar o erro original da URL
          onError?.call(urlError.toString());
          throw Exception('Erro ao baixar material: $urlError');
        }
      }
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao baixar material: $e');
    }
  }

  /// Salva metadados após download (helper interno)
  Future<void> _saveMetadataAfterDownload(
    PraiseMaterialResponse material,
    String filePath,
    File file,
  ) async {
    if (_metadataService == null || _versionService == null) return;

    try {
      final fileSize = await file.length();
      final fileName = filePath.split('/').last;
      
      // Calcular hash do arquivo
      final hash = await _versionService!.calculateFileHash(file);
      
      // Criar metadados
      final metadata = OfflineMaterialMetadata(
        materialId: material.id,
        praiseId: material.praiseId,
        materialKindId: material.materialKindId,
        materialTypeId: material.materialTypeId,
        fileName: fileName,
        filePath: filePath,
        fileSize: fileSize,
        downloadedAt: DateTime.now(),
        isKeptOffline: false, // Será atualizado se necessário
        versionHash: hash,
        versionTimestamp: DateTime.now(),
        isOld: material.isOld ?? false,
        oldDescription: material.oldDescription,
      );

      await _metadataService!.saveMetadata(metadata);
    } catch (e) {
      // Não falhar o download se salvar metadados falhar
      print('Erro ao salvar metadados: $e');
    }
  }

  /// Mantém material offline (UC-124)
  /// Marca material como mantido offline e faz download se necessário
  Future<void> keepMaterialOffline(
    PraiseMaterialResponse material, {
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  }) async {
    if (_metadataService == null) {
      throw Exception('Serviço de metadados não inicializado');
    }

    try {
      // Verificar se já está offline
      final existingMetadata = _metadataService!.getMetadata(material.id);
      final isOffline = await isMaterialOffline(material.id);

      if (isOffline && existingMetadata != null) {
        // Já está offline, apenas marcar como kept
        await _metadataService!.markAsKeptOffline(material.id, true);
        onProgress?.call(1.0);
        return;
      }

      // Não está offline, fazer download
      onProgress?.call(0.1);

      // Fazer download
      final filePath = await downloadMaterial(
        material,
        (progress) {
          // Progresso de 0.1 a 0.9
          onProgress?.call(0.1 + (progress * 0.8));
        },
        onError,
      );

      onProgress?.call(0.9);

      // Marcar como kept offline
      await _metadataService!.markAsKeptOffline(material.id, true);

      // Atualizar metadados se necessário
      final metadata = _metadataService!.getMetadata(material.id);
      if (metadata != null) {
        final file = File(filePath);
        if (await file.exists()) {
          final fileSize = await file.length();
          if (_versionService != null) {
            final hash = await _versionService!.calculateFileHash(file);
            await _metadataService!.updateVersion(
              material.id,
              hash,
              DateTime.now(),
            );
          }
        }
      }

      onProgress?.call(1.0);
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao manter material offline: $e');
    }
  }

  /// Atualiza material offline quando há nova versão (UC-139)
  /// Download de nova versão e substituição de arquivo antigo após confirmação
  Future<void> updateMaterialOffline(
    PraiseMaterialResponse material, {
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  }) async {
    if (_metadataService == null || _versionService == null) {
      throw Exception('Serviços de metadados/versionamento não inicializados');
    }

    try {
      final existingMetadata = _metadataService!.getMetadata(material.id);
      if (existingMetadata == null) {
        throw Exception('Material não encontrado no cache offline');
      }

      onProgress?.call(0.1);

      // Fazer download da nova versão
      final newFilePath = await downloadMaterial(
        material,
        (progress) {
          // Progresso de 0.1 a 0.8
          onProgress?.call(0.1 + (progress * 0.7));
        },
        onError,
      );

      onProgress?.call(0.8);

      // Verificar se download foi bem-sucedido
      final newFile = File(newFilePath);
      if (!await newFile.exists()) {
        throw Exception('Arquivo novo não foi baixado corretamente');
      }

      // Calcular hash do novo arquivo
      final newHash = await _versionService!.calculateFileHash(newFile);
      final fileSize = await newFile.length();

      // Atualizar metadados
      await _metadataService!.updateVersion(
        material.id,
        newHash,
        DateTime.now(),
      );

      // Atualizar informações de material antigo se necessário
      if (material.isOld != existingMetadata.isOld ||
          material.oldDescription != existingMetadata.oldDescription) {
        await _metadataService!.markAsOld(
          material.id,
          material.isOld ?? false,
          material.oldDescription,
        );
      }

      onProgress?.call(1.0);
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao atualizar material offline: $e');
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
      
      // Tentar remover com diferentes extensões
      final extensions = ['.pdf', '.mp3', '.wav', '.m4a', '.wma', '.aac', '.ogg'];
      for (final ext in extensions) {
        final file = File('${directory.path}/$materialId$ext');
        if (await file.exists()) {
          await file.delete();
        }
      }
    } catch (e) {
      throw Exception('Erro ao remover material offline: $e');
    }
  }

  /// Remove todos os materiais de um praise do cache offline (UC-133)
  Future<void> removePraiseOffline(String praiseId) async {
    if (_metadataService == null) {
      throw Exception('Serviço de metadados não inicializado');
    }

    try {
      final metadataList = _metadataService!.getMetadataByPraiseId(praiseId);
      
      for (final metadata in metadataList) {
        // Remover arquivo
        await removeOfflineMaterial(metadata.materialId);
        
        // Remover metadados
        await _metadataService!.deleteMetadata(metadata.materialId);
      }
    } catch (e) {
      throw Exception('Erro ao remover praise offline: $e');
    }
  }

  /// Limpa todo o cache offline (UC-134)
  Future<void> clearAllOfflineCache() async {
    if (_metadataService == null) {
      throw Exception('Serviço de metadados não inicializado');
    }

    try {
      final allMetadata = _metadataService!.getAllMetadata();
      
      // Remover todos os arquivos
      for (final metadata in allMetadata) {
        await removeOfflineMaterial(metadata.materialId);
      }
      
      // Limpar todos os metadados
      await _metadataService!.clearAllMetadata();
    } catch (e) {
      throw Exception('Erro ao limpar cache offline: $e');
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

  /// Baixa materiais em lote por critérios (tags, material kinds) em formato ZIP
  /// Permite ao usuário escolher onde salvar usando file picker
  Future<String?> downloadBatchZip({
    List<String>? tagIds,
    List<String>? materialKindIds,
    required String operation,
    int? maxZipSizeMb,
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  }) async {
    try {
      onProgress?.call(0.1);
      final response = await _apiService.downloadBatchZip(
        tagIds: tagIds,
        materialKindIds: materialKindIds,
        operation: operation,
        maxZipSizeMb: maxZipSizeMb,
      );

      if (response.statusCode != 200) {
        throw Exception('Erro ao baixar ZIP: ${response.statusCode}');
      }

      if (response.data is! Uint8List) {
        throw Exception('Formato de resposta inválido');
      }

      onProgress?.call(0.5);

      final suggestedFileName = 'materials_batch.zip';

      final String? savePath = await FilePicker.platform.saveFile(
        dialogTitle: 'Salvar ZIP de Materiais',
        fileName: suggestedFileName,
        type: FileType.custom,
        allowedExtensions: ['zip'],
      );

      if (savePath == null) {
        return null;
      }

      onProgress?.call(0.8);

      final file = File(savePath);
      await file.writeAsBytes(response.data as Uint8List);

      onProgress?.call(1.0);
      return file.path;
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao baixar ZIP em lote: $e');
    }
  }

  /// Baixa arquivo de material para fora da aplicação (UC-123)
  /// Permite ao usuário escolher onde salvar usando file picker
  /// Suporta PDF, Audio (.mp3, .wav, .m4a, etc.) e outros tipos
  Future<String?> downloadMaterialToExternalPath(
    PraiseMaterialResponse material, {
    Function(double progress)? onProgress,
    Function(String? error)? onError,
  }) async {
    try {
      onProgress?.call(0.1);

      // Determinar extensão do arquivo baseado no tipo de material
      String extension = '.pdf'; // padrão
      String? contentType;

      // Verificar tipo de material via material_type
      if (material.materialType != null) {
        final typeName = material.materialType!.name.toLowerCase();
        if (typeName == 'audio') {
          // Tentar detectar extensão do path
          final pathLower = material.path.toLowerCase();
          if (pathLower.endsWith('.mp3')) {
            extension = '.mp3';
            contentType = 'audio/mpeg';
          } else if (pathLower.endsWith('.wav')) {
            extension = '.wav';
            contentType = 'audio/wav';
          } else if (pathLower.endsWith('.m4a')) {
            extension = '.m4a';
            contentType = 'audio/mp4';
          } else if (pathLower.endsWith('.wma')) {
            extension = '.wma';
            contentType = 'audio/x-ms-wma';
          } else if (pathLower.endsWith('.aac')) {
            extension = '.aac';
            contentType = 'audio/aac';
          } else if (pathLower.endsWith('.ogg')) {
            extension = '.ogg';
            contentType = 'audio/ogg';
          } else {
            extension = '.mp3'; // padrão para áudio
            contentType = 'audio/mpeg';
          }
        } else if (typeName == 'pdf') {
          extension = '.pdf';
          contentType = 'application/pdf';
        } else {
          // Tentar detectar extensão do path
          final pathLower = material.path.toLowerCase();
          if (pathLower.contains('.')) {
            extension = pathLower.substring(pathLower.lastIndexOf('.'));
          }
        }
      } else {
        // Tentar detectar extensão do path
        final pathLower = material.path.toLowerCase();
        if (pathLower.contains('.')) {
          extension = pathLower.substring(pathLower.lastIndexOf('.'));
        }
      }

      // Obter URL temporária ou usar endpoint de download
      String? downloadUrl;
      try {
        final urlResponse = await _apiService.getDownloadUrl(material.id);
        downloadUrl = urlResponse.downloadUrl;
      } catch (e) {
        // Se falhar, usar endpoint direto
        downloadUrl = null;
      }

      onProgress?.call(0.2);

      // Baixar arquivo
      Uint8List fileBytes;
      if (downloadUrl != null && _isWasabiUrl(downloadUrl)) {
        // Download direto da URL assinada
        fileBytes = await _downloadFromUrl(
          downloadUrl,
          (progress) {
            onProgress?.call(0.2 + (progress * 0.6));
          },
        );
      } else {
        // Usar endpoint /download
        final response = await _apiService.dio.get<List<int>>(
          "/api/v1/praise-materials/${material.id}/download",
          options: Options(
            responseType: ResponseType.bytes,
            followRedirects: true,
            validateStatus: (status) => status != null && status < 500,
          ),
          onReceiveProgress: (received, total) {
            if (total > 0) {
              final progress = 0.2 + (received / total) * 0.6;
              onProgress?.call(progress);
            }
          },
        );

        if (response.statusCode != 200 || response.data == null) {
          throw Exception('Download falhou com status: ${response.statusCode}');
        }

        fileBytes = Uint8List.fromList(response.data!);
      }

      onProgress?.call(0.8);

      // Preparar nome do arquivo sugerido
      final materialKindName = material.materialKind?.name ?? 'material';
      final safeName = materialKindName.replaceAll(RegExp(r'[^\w\s-]'), '_');
      final suggestedFileName = '${safeName}_${material.id.substring(0, 8)}$extension';

      // Permitir ao usuário escolher onde salvar
      final String? savePath = await FilePicker.platform.saveFile(
        dialogTitle: 'Salvar Arquivo',
        fileName: suggestedFileName,
        type: FileType.custom,
        allowedExtensions: [extension.substring(1)], // remover o ponto
      );

      if (savePath == null) {
        // Usuário cancelou
        return null;
      }

      onProgress?.call(0.9);

      // Salvar bytes no arquivo escolhido pelo usuário
      final file = File(savePath);
      await file.writeAsBytes(fileBytes);
      
      onProgress?.call(1.0);
      return file.path;
    } catch (e) {
      onError?.call(e.toString());
      throw Exception('Erro ao baixar material: $e');
    }
  }
}
