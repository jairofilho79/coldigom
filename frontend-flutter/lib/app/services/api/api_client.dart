import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:hive/hive.dart';
import '../../../core/config/hive_config.dart';
import '../connectivity_service.dart';

/// Exceção customizada para erros de autenticação que devem ser silenciosamente ignorados
/// pois o redirecionamento para login já está sendo feito
class UnauthorizedException implements Exception {
  final String message;
  UnauthorizedException([this.message = 'Unauthorized']);
  
  @override
  String toString() => message;
}

/// Cliente HTTP base com interceptors
class ApiClient {
  late final Dio _dio;
  final String baseUrl;
  final VoidCallback? onUnauthorized;
  final ConnectivityService? _connectivityService;
  
  /// Guarda para evitar que múltiplos 401 simultâneos
  /// disparem logout/redirect repetidamente.
  bool _isHandling401 = false;

  ApiClient({
    required this.baseUrl,
    this.onUnauthorized,
    ConnectivityService? connectivityService,
  }) : _connectivityService = connectivityService {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
    ));

    _setupInterceptors();
  }

  void _setupInterceptors() {
    // Interceptor de logging (apenas em debug)
    if (kDebugMode) {
      _dio.interceptors.add(
        LogInterceptor(
          requestBody: true,
          responseBody: true,
          requestHeader: true,
          responseHeader: false,
          error: true,
        ),
      );
    }

    // Interceptor para adicionar token JWT
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (kDebugMode) {
            debugPrint('🌐 API Request: ${options.method} ${options.uri}');
          }

          final authBox = Hive.box(HiveConfig.authBoxName);
          final token = authBox.get('token');
          
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          // Adicionar Accept-Language header
          final preferencesBox = Hive.box(HiveConfig.preferencesBoxName);
          final language = preferencesBox.get('language', defaultValue: 'pt-BR');
          options.headers['Accept-Language'] = language;

          return handler.next(options);
        },
        onResponse: (response, handler) {
          if (kDebugMode) {
            debugPrint('✅ API Response: ${response.statusCode} ${response.requestOptions.uri}');
          }
          return handler.next(response);
        },
        onError: (error, handler) async {
          if (kDebugMode) {
            debugPrint('❌ API Error: ${error.type} - ${error.message}');
            debugPrint('   URL: ${error.requestOptions.uri}');
            debugPrint('   Base URL: ${error.requestOptions.baseUrl}');
            if (error.response != null) {
              debugPrint('   Status: ${error.response?.statusCode}');
              debugPrint('   Data: ${error.response?.data}');
            } else {
              debugPrint('   ⚠️  Sem resposta do servidor');
              debugPrint('   💡 Verifique se o backend está rodando em $baseUrl');
              debugPrint('   💡 Execute: docker-compose -f docker-compose.dev.yml ps');
            }
          }

          // Tratar erro 401 (não autorizado)
          if (error.response?.statusCode == 401) {
            // Se offline: não invalidar sessão - permitir uso do app em modo offline
            final isOffline = _connectivityService != null &&
                !await _connectivityService!.isOnline(timeout: const Duration(seconds: 2));
            if (isOffline) {
              if (kDebugMode) {
                debugPrint('   📴 Modo offline: mantendo sessão local em 401');
              }
              return handler.next(error);
            }

            // Online com 401: token expirado - fazer logout
            if (!_isHandling401) {
              _isHandling401 = true;
              final authBox = Hive.box(HiveConfig.authBoxName);
              authBox.clear();
              onUnauthorized?.call();
              Future.delayed(const Duration(seconds: 2), () {
                _isHandling401 = false;
              });
            }
            return handler.reject(
              DioException(
                requestOptions: error.requestOptions,
                response: error.response,
                type: DioExceptionType.badResponse,
                error: UnauthorizedException('Token expirado. Redirecionando para login...'),
              ),
            );
          }
          return handler.next(error);
        },
      ),
    );
  }

  Dio get dio => _dio;
}
