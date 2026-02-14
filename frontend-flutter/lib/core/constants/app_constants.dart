import 'dart:io';

/// Constantes da aplicação
class AppConstants {
  // API - no dispositivo físico use --dart-define=FLUTTER_API_BASE_URL=http://IP_DO_MAC:8000
  // (variável de ambiente do terminal não chega no app no iPad)
  static String get apiBaseUrl {
    const fromDefine = String.fromEnvironment(
      'FLUTTER_API_BASE_URL',
      defaultValue: '',
    );
    if (fromDefine.isNotEmpty) return fromDefine;
    final envUrl = Platform.environment['FLUTTER_API_BASE_URL'];
    return envUrl ?? defaultApiBaseUrl;
  }

  // Usar 127.0.0.1 ao invés de localhost para evitar problemas de firewall no macOS
  static const String defaultApiBaseUrl = 'http://127.0.0.1:8000';
  
  // Storage keys
  static const String tokenKey = 'token';
  static const String userKey = 'user';
  static const String languageKey = 'language';
  
  // Default values
  static const String defaultLanguage = 'pt-BR';
  
  // Offline storage
  static const String offlinePdfsDir = 'offline_pdfs';
  
  // Debug
  static bool get isDebugMode {
    bool inDebugMode = false;
    assert(inDebugMode = true);
    return inDebugMode;
  }
}
