import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../../models/user_model.dart';
import '../../models/praise_model.dart';
import '../../models/praise_tag_model.dart';
import '../../models/material_kind_model.dart';
import '../../models/material_type_model.dart';
import '../../models/praise_material_model.dart';
import '../../../core/constants/app_constants.dart';

/// Serviço de API usando Dio diretamente
class ApiService {
  final ApiClient _apiClient;

  ApiService(this._apiClient);

  Dio get _dio => _apiClient.dio;

  // Auth
  Future<Token> register(UserCreate user) async {
    final response = await _dio.post(
      '/api/v1/auth/register',
      data: user.toJson(),
    );
    return Token.fromJson(response.data);
  }

  Future<Token> login(String username, String password) async {
    final response = await _dio.post(
      '/api/v1/auth/login',
      data: {
        'username': username,
        'password': password,
      },
    );
    return Token.fromJson(response.data);
  }

  // Praises
  Future<List<PraiseResponse>> getPraises({
    int? skip,
    int? limit,
    String? name,
    String? tagId,
  }) async {
    final response = await _dio.get(
      '/api/v1/praises/',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
        if (name != null) 'name': name,
        if (tagId != null) 'tag_id': tagId,
      },
    );
    return (response.data as List)
        .map((json) => PraiseResponse.fromJson(json))
        .toList();
  }

  Future<PraiseResponse> getPraiseById(String id) async {
    final response = await _dio.get('/api/v1/praises/$id');
    return PraiseResponse.fromJson(response.data);
  }

  Future<PraiseResponse> createPraise(PraiseCreate praise) async {
    final response = await _dio.post(
      '/api/v1/praises/',
      data: praise.toJson(),
    );
    return PraiseResponse.fromJson(response.data);
  }

  Future<PraiseResponse> updatePraise(String id, PraiseUpdate praise) async {
    final response = await _dio.put(
      '/api/v1/praises/$id',
      data: praise.toJson(),
    );
    return PraiseResponse.fromJson(response.data);
  }

  Future<void> deletePraise(String id) async {
    await _dio.delete('/api/v1/praises/$id');
  }

  // Tags
  Future<List<PraiseTagResponse>> getTags({
    int? skip,
    int? limit,
  }) async {
    final response = await _dio.get(
      '/api/v1/praise-tags/',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
      },
    );
    return (response.data as List)
        .map((json) => PraiseTagResponse.fromJson(json))
        .toList();
  }

  Future<PraiseTagResponse> createTag(PraiseTagCreate tag) async {
    final response = await _dio.post(
      '/api/v1/praise-tags/',
      data: tag.toJson(),
    );
    return PraiseTagResponse.fromJson(response.data);
  }

  Future<PraiseTagResponse> updateTag(String id, PraiseTagUpdate tag) async {
    final response = await _dio.put(
      '/api/v1/praise-tags/$id',
      data: tag.toJson(),
    );
    return PraiseTagResponse.fromJson(response.data);
  }

  Future<void> deleteTag(String id) async {
    await _dio.delete('/api/v1/praise-tags/$id');
  }

  // Material Kinds
  Future<List<MaterialKindResponse>> getMaterialKinds({
    int? skip,
    int? limit,
  }) async {
    final response = await _dio.get(
      '/api/v1/material-kinds/',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
      },
    );
    return (response.data as List)
        .map((json) => MaterialKindResponse.fromJson(json))
        .toList();
  }

  // Material Types
  Future<List<MaterialTypeResponse>> getMaterialTypes({
    int? skip,
    int? limit,
  }) async {
    final response = await _dio.get(
      '/api/v1/material-types/',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
      },
    );
    return (response.data as List)
        .map((json) => MaterialTypeResponse.fromJson(json))
        .toList();
  }

  // Materials
  Future<List<PraiseMaterialResponse>> getMaterials({
    int? skip,
    int? limit,
    String? praiseId,
  }) async {
    final response = await _dio.get(
      '/api/v1/praise-materials/',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
        if (praiseId != null) 'praise_id': praiseId,
      },
    );
    return (response.data as List)
        .map((json) => PraiseMaterialResponse.fromJson(json))
        .toList();
  }

  Future<DownloadUrlResponse> getDownloadUrl(
    String id, {
    int? expiration,
  }) async {
    final response = await _dio.get(
      '/api/v1/praise-materials/$id/download-url',
      queryParameters: {
        if (expiration != null) 'expiration': expiration,
      },
    );
    return DownloadUrlResponse.fromJson(response.data);
  }
}

/// Provider do serviço de API
final apiServiceProvider = Provider<ApiService>((ref) {
  final apiClient = ApiClient(baseUrl: AppConstants.defaultApiBaseUrl);
  return ApiService(apiClient);
});

