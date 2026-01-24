import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:hive/hive.dart';
import '../../../core/config/hive_config.dart';
import '../../../core/constants/app_constants.dart';

/// Cliente HTTP base com interceptors
class ApiClient {
  late final Dio _dio;
  final String baseUrl;

  ApiClient({required this.baseUrl}) {
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
        onError: (error, handler) {
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
            final authBox = Hive.box(HiveConfig.authBoxName);
            authBox.clear();
            // Redirecionar para login será feito no app
          }
          return handler.next(error);
        },
      ),
    );
  }

  Dio get dio => _dio;
}
