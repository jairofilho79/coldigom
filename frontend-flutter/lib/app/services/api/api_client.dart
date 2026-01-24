import 'package:dio/dio.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:hive/hive.dart';
import '../../../core/config/hive_config.dart';

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
    // Interceptor para adicionar token JWT
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
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
        onError: (error, handler) {
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
