import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../../models/user_model.dart';
import '../../stores/auth_store.dart';
import '../../models/praise_model.dart';
import '../../models/praise_tag_model.dart';
import '../../models/language_model.dart';
import '../../models/material_kind_model.dart';
import '../../models/material_type_model.dart';
import '../../models/praise_material_model.dart';
import '../../models/praise_list_model.dart';
import '../../models/translation_model.dart';
import '../../models/room_model.dart';
import '../../../core/constants/app_constants.dart';

/// Serviço de API usando Dio diretamente
class ApiService {
  final ApiClient _apiClient;

  ApiService(this._apiClient);

  Dio get _dio => _apiClient.dio;
  
  /// Expõe o Dio para uso em outros serviços (ex: download direto)
  Dio get dio => _apiClient.dio;

  // Auth
  Future<Token> register(UserCreate user) async {
    final response = await _dio.post(
      '/api/v1/auth/register',
      data: user.toJson(),
    );
    return Token.fromJson(response.data);
  }

  Future<Token> login(String username, String password) async {
    // OAuth2PasswordRequestForm espera application/x-www-form-urlencoded
    final response = await _dio.post(
      '/api/v1/auth/login',
      data: {
        'username': username,
        'password': password,
      },
      options: Options(
        contentType: Headers.formUrlEncodedContentType,
      ),
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

  Future<PraiseResponse> reviewAction(String praiseId, ReviewActionRequest request) async {
    final response = await _dio.post(
      '/api/v1/praises/$praiseId/review',
      data: request.toJson(),
    );
    return PraiseResponse.fromJson(response.data);
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

  Future<PraiseTagResponse> getTagById(String id) async {
    final response = await _dio.get('/api/v1/praise-tags/$id');
    return PraiseTagResponse.fromJson(response.data);
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

  // Languages
  Future<List<LanguageResponse>> getLanguages({
    int? skip,
    int? limit,
    bool? activeOnly,
  }) async {
    final response = await _dio.get(
      '/api/v1/languages/',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
        if (activeOnly != null) 'active_only': activeOnly,
      },
    );
    return (response.data as List)
        .map((json) => LanguageResponse.fromJson(json))
        .toList();
  }

  Future<LanguageResponse> getLanguageByCode(String code) async {
    final response = await _dio.get('/api/v1/languages/$code');
    return LanguageResponse.fromJson(response.data);
  }

  Future<LanguageResponse> createLanguage(LanguageCreate language) async {
    final response = await _dio.post(
      '/api/v1/languages/',
      data: language.toJson(),
    );
    return LanguageResponse.fromJson(response.data);
  }

  Future<LanguageResponse> updateLanguage(String code, LanguageUpdate language) async {
    final response = await _dio.put(
      '/api/v1/languages/$code',
      data: language.toJson(),
    );
    return LanguageResponse.fromJson(response.data);
  }

  Future<void> deleteLanguage(String code) async {
    await _dio.delete('/api/v1/languages/$code');
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

  Future<MaterialKindResponse> getMaterialKind(String id) async {
    final response = await _dio.get('/api/v1/material-kinds/$id');
    return MaterialKindResponse.fromJson(response.data);
  }

  Future<MaterialKindResponse> createMaterialKind(MaterialKindCreate kind) async {
    final response = await _dio.post(
      '/api/v1/material-kinds/',
      data: kind.toJson(),
    );
    return MaterialKindResponse.fromJson(response.data);
  }

  Future<MaterialKindResponse> updateMaterialKind(String id, MaterialKindUpdate kind) async {
    final response = await _dio.put(
      '/api/v1/material-kinds/$id',
      data: kind.toJson(),
    );
    return MaterialKindResponse.fromJson(response.data);
  }

  Future<void> deleteMaterialKind(String id) async {
    await _dio.delete('/api/v1/material-kinds/$id');
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

  Future<MaterialTypeResponse> getMaterialType(String id) async {
    final response = await _dio.get('/api/v1/material-types/$id');
    return MaterialTypeResponse.fromJson(response.data);
  }

  Future<MaterialTypeResponse> createMaterialType(MaterialTypeCreate type) async {
    final response = await _dio.post(
      '/api/v1/material-types/',
      data: type.toJson(),
    );
    return MaterialTypeResponse.fromJson(response.data);
  }

  Future<MaterialTypeResponse> updateMaterialType(String id, MaterialTypeUpdate type) async {
    final response = await _dio.put(
      '/api/v1/material-types/$id',
      data: type.toJson(),
    );
    return MaterialTypeResponse.fromJson(response.data);
  }

  Future<void> deleteMaterialType(String id) async {
    await _dio.delete('/api/v1/material-types/$id');
  }

  // Materials
  Future<List<PraiseMaterialResponse>> getMaterials({
    int? skip,
    int? limit,
    String? praiseId,
    bool? isOld,
  }) async {
    final response = await _dio.get(
      '/api/v1/praise-materials/',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
        if (praiseId != null) 'praise_id': praiseId,
        if (isOld != null) 'is_old': isOld,
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

  Future<PraiseMaterialResponse> getMaterialById(String id) async {
    final response = await _dio.get('/api/v1/praise-materials/$id');
    return PraiseMaterialResponse.fromJson(response.data);
  }

  Future<PraiseMaterialResponse> updateMaterial(String id, PraiseMaterialUpdate material) async {
    final response = await _dio.put(
      '/api/v1/praise-materials/$id',
      data: material.toJson(),
    );
    return PraiseMaterialResponse.fromJson(response.data);
  }

  Future<void> deleteMaterial(String id) async {
    await _dio.delete('/api/v1/praise-materials/$id');
  }

  Future<PraiseMaterialResponse> uploadMaterial(
    String praiseId,
    File file,
    String materialKindId, {
    bool? isOld,
    String? oldDescription,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: file.path.split('/').last),
      'praise_id': praiseId,
      'material_kind_id': materialKindId,
      if (isOld != null) 'is_old': isOld.toString(),
      if (oldDescription != null && oldDescription.isNotEmpty) 'old_description': oldDescription,
    });

    final response = await _dio.post(
      '/api/v1/praise-materials/upload',
      data: formData,
      options: Options(
        contentType: Headers.multipartFormDataContentType,
      ),
    );
    return PraiseMaterialResponse.fromJson(response.data);
  }

  Future<PraiseMaterialResponse> replaceMaterialFile(
    String materialId,
    File file, {
    String? materialKindId,
    bool? isOld,
    String? oldDescription,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: file.path.split('/').last),
      if (materialKindId != null) 'material_kind_id': materialKindId,
      if (isOld != null) 'is_old': isOld.toString(),
      if (oldDescription != null && oldDescription.isNotEmpty) 'old_description': oldDescription,
    });

    final response = await _dio.put(
      '/api/v1/praise-materials/$materialId/upload',
      data: formData,
      options: Options(
        contentType: Headers.multipartFormDataContentType,
      ),
    );
    
    return PraiseMaterialResponse.fromJson(response.data);
  }

  Future<PraiseMaterialResponse> createMaterial(PraiseMaterialCreate material) async {
    final response = await _dio.post(
      '/api/v1/praise-materials/',
      data: material.toJson(),
    );
    return PraiseMaterialResponse.fromJson(response.data);
  }

  // Downloads ZIP
  Future<Response> downloadPraiseZip(String praiseId) async {
    return await _dio.get(
      '/api/v1/praises/$praiseId/download-zip',
      options: Options(
        responseType: ResponseType.bytes,
        followRedirects: false,
        validateStatus: (status) => status! < 500,
      ),
    );
  }

  Future<Response> downloadByMaterialKind(
    String materialKindId, {
    String? tagId,
    int? maxZipSizeMb,
  }) async {
    return await _dio.get(
      '/api/v1/praises/download-by-material-kind',
      queryParameters: {
        'material_kind_id': materialKindId,
        if (tagId != null) 'tag_id': tagId,
        if (maxZipSizeMb != null) 'max_zip_size_mb': maxZipSizeMb,
      },
      options: Options(
        responseType: ResponseType.bytes,
        followRedirects: false,
        validateStatus: (status) => status! < 500,
      ),
    );
  }

  // Translations - MaterialKind
  Future<List<MaterialKindTranslationResponse>> getMaterialKindTranslations({
    String? materialKindId,
    String? languageCode,
  }) async {
    final response = await _dio.get(
      '/api/v1/translations/material-kinds',
      queryParameters: {
        if (materialKindId != null) 'material_kind_id': materialKindId,
        if (languageCode != null) 'language_code': languageCode,
      },
    );
    return (response.data as List)
        .map((json) => MaterialKindTranslationResponse.fromJson(json))
        .toList();
  }

  Future<MaterialKindTranslationResponse> getMaterialKindTranslation(String id) async {
    final response = await _dio.get('/api/v1/translations/material-kinds/$id');
    return MaterialKindTranslationResponse.fromJson(response.data);
  }

  Future<MaterialKindTranslationResponse> createMaterialKindTranslation(
    MaterialKindTranslationCreate data,
  ) async {
    final response = await _dio.post(
      '/api/v1/translations/material-kinds',
      data: data.toJson(),
    );
    return MaterialKindTranslationResponse.fromJson(response.data);
  }

  Future<MaterialKindTranslationResponse> updateMaterialKindTranslation(
    String id,
    MaterialKindTranslationUpdate data,
  ) async {
    final response = await _dio.put(
      '/api/v1/translations/material-kinds/$id',
      data: data.toJson(),
    );
    return MaterialKindTranslationResponse.fromJson(response.data);
  }

  Future<void> deleteMaterialKindTranslation(String id) async {
    await _dio.delete('/api/v1/translations/material-kinds/$id');
  }

  // Translations - PraiseTag
  Future<List<PraiseTagTranslationResponse>> getPraiseTagTranslations({
    String? praiseTagId,
    String? languageCode,
  }) async {
    final response = await _dio.get(
      '/api/v1/translations/praise-tags',
      queryParameters: {
        if (praiseTagId != null) 'praise_tag_id': praiseTagId,
        if (languageCode != null) 'language_code': languageCode,
      },
    );
    return (response.data as List)
        .map((json) => PraiseTagTranslationResponse.fromJson(json))
        .toList();
  }

  Future<PraiseTagTranslationResponse> getPraiseTagTranslation(String id) async {
    final response = await _dio.get('/api/v1/translations/praise-tags/$id');
    return PraiseTagTranslationResponse.fromJson(response.data);
  }

  Future<PraiseTagTranslationResponse> createPraiseTagTranslation(
    PraiseTagTranslationCreate data,
  ) async {
    final response = await _dio.post(
      '/api/v1/translations/praise-tags',
      data: data.toJson(),
    );
    return PraiseTagTranslationResponse.fromJson(response.data);
  }

  Future<PraiseTagTranslationResponse> updatePraiseTagTranslation(
    String id,
    PraiseTagTranslationUpdate data,
  ) async {
    final response = await _dio.put(
      '/api/v1/translations/praise-tags/$id',
      data: data.toJson(),
    );
    return PraiseTagTranslationResponse.fromJson(response.data);
  }

  Future<void> deletePraiseTagTranslation(String id) async {
    await _dio.delete('/api/v1/translations/praise-tags/$id');
  }

  // Translations - MaterialType
  Future<List<MaterialTypeTranslationResponse>> getMaterialTypeTranslations({
    String? materialTypeId,
    String? languageCode,
  }) async {
    final response = await _dio.get(
      '/api/v1/translations/material-types',
      queryParameters: {
        if (materialTypeId != null) 'material_type_id': materialTypeId,
        if (languageCode != null) 'language_code': languageCode,
      },
    );
    return (response.data as List)
        .map((json) => MaterialTypeTranslationResponse.fromJson(json))
        .toList();
  }

  Future<MaterialTypeTranslationResponse> getMaterialTypeTranslation(String id) async {
    final response = await _dio.get('/api/v1/translations/material-types/$id');
    return MaterialTypeTranslationResponse.fromJson(response.data);
  }

  Future<MaterialTypeTranslationResponse> createMaterialTypeTranslation(
    MaterialTypeTranslationCreate data,
  ) async {
    final response = await _dio.post(
      '/api/v1/translations/material-types',
      data: data.toJson(),
    );
    return MaterialTypeTranslationResponse.fromJson(response.data);
  }

  Future<MaterialTypeTranslationResponse> updateMaterialTypeTranslation(
    String id,
    MaterialTypeTranslationUpdate data,
  ) async {
    final response = await _dio.put(
      '/api/v1/translations/material-types/$id',
      data: data.toJson(),
    );
    return MaterialTypeTranslationResponse.fromJson(response.data);
  }

  Future<void> deleteMaterialTypeTranslation(String id) async {
    await _dio.delete('/api/v1/translations/material-types/$id');
  }

  // Praise Lists
  Future<List<PraiseListResponse>> getPraiseLists({
    String? name,
    String? dateFrom,
    String? dateTo,
  }) async {
    final response = await _dio.get(
      '/api/v1/praise-lists/',
      queryParameters: {
        if (name != null && name.isNotEmpty) 'name': name,
        if (dateFrom != null) 'date_from': dateFrom,
        if (dateTo != null) 'date_to': dateTo,
      },
    );
    return (response.data as List)
        .map((json) => PraiseListResponse.fromJson(json))
        .toList();
  }

  Future<List<PraiseListResponse>> getPublicPraiseLists({
    int? skip,
    int? limit,
  }) async {
    final response = await _dio.get(
      '/api/v1/praise-lists/public',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
      },
    );
    return (response.data as List)
        .map((json) => PraiseListResponse.fromJson(json))
        .toList();
  }

  Future<PraiseListDetailResponse> getPraiseListById(String id) async {
    final response = await _dio.get('/api/v1/praise-lists/$id');
    return PraiseListDetailResponse.fromJson(response.data);
  }

  Future<PraiseListResponse> createPraiseList(PraiseListCreate data) async {
    final response = await _dio.post(
      '/api/v1/praise-lists/',
      data: data.toJson(),
    );
    return PraiseListResponse.fromJson(response.data);
  }

  Future<PraiseListResponse> updatePraiseList(String id, PraiseListUpdate data) async {
    final response = await _dio.put(
      '/api/v1/praise-lists/$id',
      data: data.toJson(),
    );
    return PraiseListResponse.fromJson(response.data);
  }

  Future<void> deletePraiseList(String id) async {
    await _dio.delete('/api/v1/praise-lists/$id');
  }

  Future<void> addPraiseToList(String listId, String praiseId) async {
    await _dio.post('/api/v1/praise-lists/$listId/praises/$praiseId');
  }

  Future<void> removePraiseFromList(String listId, String praiseId) async {
    await _dio.delete('/api/v1/praise-lists/$listId/praises/$praiseId');
  }

  Future<void> reorderPraisesInList(String listId, ReorderPraisesRequest data) async {
    await _dio.put(
      '/api/v1/praise-lists/$listId/praises/reorder',
      data: data.toJson(),
    );
  }

  Future<void> followList(String listId) async {
    await _dio.post('/api/v1/praise-lists/$listId/follow');
  }

  Future<void> unfollowList(String listId) async {
    await _dio.delete('/api/v1/praise-lists/$listId/follow');
  }

  Future<PraiseListResponse> copyList(String listId) async {
    final response = await _dio.post('/api/v1/praise-lists/$listId/copy');
    return PraiseListResponse.fromJson(response.data);
  }

  // Rooms
  Future<List<RoomResponse>> getRooms() async {
    final response = await _dio.get('/api/v1/rooms/');
    return (response.data as List)
        .map((json) => RoomResponse.fromJson(json))
        .toList();
  }

  Future<List<RoomResponse>> getPublicRooms({
    int? skip,
    int? limit,
  }) async {
    final response = await _dio.get(
      '/api/v1/rooms/public',
      queryParameters: {
        if (skip != null) 'skip': skip,
        if (limit != null) 'limit': limit,
      },
    );
    return (response.data as List)
        .map((json) => RoomResponse.fromJson(json))
        .toList();
  }

  Future<RoomDetailResponse> getRoomById(String id) async {
    final response = await _dio.get('/api/v1/rooms/$id');
    return RoomDetailResponse.fromJson(response.data);
  }

  Future<RoomDetailResponse> getRoomByCode(String code) async {
    final response = await _dio.get('/api/v1/rooms/code/$code');
    return RoomDetailResponse.fromJson(response.data);
  }

  Future<RoomResponse> createRoom(RoomCreate room) async {
    final response = await _dio.post(
      '/api/v1/rooms/',
      data: room.toJson(),
    );
    return RoomResponse.fromJson(response.data);
  }

  Future<RoomResponse> updateRoom(String id, RoomUpdate room) async {
    final response = await _dio.put(
      '/api/v1/rooms/$id',
      data: room.toJson(),
    );
    return RoomResponse.fromJson(response.data);
  }

  Future<void> deleteRoom(String id) async {
    await _dio.delete('/api/v1/rooms/$id');
  }

  Future<RoomDetailResponse> joinRoom(String roomId, {String? password}) async {
    final response = await _dio.post(
      '/api/v1/rooms/$roomId/join',
      data: password != null ? RoomJoinRequest(password: password).toJson() : null,
    );
    return RoomDetailResponse.fromJson(response.data);
  }

  Future<RoomDetailResponse> joinRoomByCode(String code, {String? password}) async {
    final response = await _dio.post(
      '/api/v1/rooms/code/$code/join',
      data: password != null ? RoomJoinRequest(password: password).toJson() : null,
    );
    return RoomDetailResponse.fromJson(response.data);
  }

  Future<void> leaveRoom(String roomId) async {
    await _dio.post('/api/v1/rooms/$roomId/leave');
  }

  Future<void> addPraiseToRoom(String roomId, String praiseId) async {
    await _dio.post('/api/v1/rooms/$roomId/praises/$praiseId');
  }

  Future<void> removePraiseFromRoom(String roomId, String praiseId) async {
    await _dio.delete('/api/v1/rooms/$roomId/praises/$praiseId');
  }

  Future<void> reorderPraisesInRoom(String roomId, RoomPraiseReorder reorder) async {
    await _dio.put(
      '/api/v1/rooms/$roomId/praises/reorder',
      data: reorder.toJson(),
    );
  }

  Future<void> importPraiseListToRoom(String roomId, String listId) async {
    await _dio.post('/api/v1/rooms/$roomId/import-list/$listId');
  }

  Future<List<RoomMessageResponse>> getRoomMessages(String roomId) async {
    final response = await _dio.get('/api/v1/rooms/$roomId/messages');
    return (response.data as List)
        .map((json) => RoomMessageResponse.fromJson(json))
        .toList();
  }

  Future<RoomMessageResponse> sendRoomMessage(String roomId, String message) async {
    final response = await _dio.post(
      '/api/v1/rooms/$roomId/messages',
      data: RoomMessageCreate(message: message).toJson(),
    );
    return RoomMessageResponse.fromJson(response.data);
  }

  Future<List<Map<String, dynamic>>> getRoomParticipants(String roomId) async {
    final response = await _dio.get('/api/v1/rooms/$roomId/participants');
    return (response.data as List).cast<Map<String, dynamic>>();
  }
}

/// Provider do serviço de API
final apiServiceProvider = Provider<ApiService>((ref) {
  // Callback para ser chamado quando houver erro 401
  // Isso atualiza o estado de autenticação e faz o GoRouter redirecionar para login
  final onUnauthorized = () {
    final authNotifier = ref.read(authProvider.notifier);
    authNotifier.logout();
  };
  
  final apiClient = ApiClient(
    baseUrl: AppConstants.apiBaseUrl,
    onUnauthorized: onUnauthorized,
  );
  return ApiService(apiClient);
});

