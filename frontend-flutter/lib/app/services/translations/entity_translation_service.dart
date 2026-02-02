import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_service.dart';
import '../../models/translation_model.dart';
import '../../models/material_kind_model.dart';
import '../../models/material_type_model.dart';
import '../../models/praise_tag_model.dart';

/// Serviço para tradução de entidades (MaterialKind, MaterialType, PraiseTag)
/// Usa uma camada de abstração (Adapter/Wrapper Pattern) para buscar traduções
/// dinamicamente baseado no ID da entidade e idioma atual
class EntityTranslationService {
  final ApiService _apiService;
  final String _currentLanguageCode;

  // Cache de traduções
  final Map<String, MaterialKindTranslationResponse> _materialKindCache = {};
  final Map<String, PraiseTagTranslationResponse> _praiseTagCache = {};
  final Map<String, MaterialTypeTranslationResponse> _materialTypeCache = {};

  EntityTranslationService({
    required ApiService apiService,
    required String currentLanguageCode,
  })  : _apiService = apiService,
        _currentLanguageCode = currentLanguageCode;

  /// Busca tradução de MaterialKind
  /// Retorna o nome traduzido se existir, caso contrário retorna o fallback
  Future<String> getMaterialKindName(
    String entityId,
    String fallbackName,
  ) async {
    final cacheKey = '${entityId}_$_currentLanguageCode';
    
    // Verificar cache primeiro
    if (_materialKindCache.containsKey(cacheKey)) {
      return _materialKindCache[cacheKey]!.translatedName;
    }

    try {
      final translations = await _apiService.getMaterialKindTranslations(
        materialKindId: entityId,
        languageCode: _currentLanguageCode,
      );

      if (translations.isNotEmpty) {
        final translation = translations.first;
        _materialKindCache[cacheKey] = translation;
        return translation.translatedName;
      }
    } catch (e) {
      // Em caso de erro, retornar fallback
      debugPrint('Erro ao buscar tradução de MaterialKind: $e');
    }

    return fallbackName;
  }

  /// Busca tradução de PraiseTag
  /// Retorna o nome traduzido se existir, caso contrário retorna o fallback
  Future<String> getPraiseTagName(
    String entityId,
    String fallbackName,
  ) async {
    final cacheKey = '${entityId}_$_currentLanguageCode';
    
    // Verificar cache primeiro
    if (_praiseTagCache.containsKey(cacheKey)) {
      return _praiseTagCache[cacheKey]!.translatedName;
    }

    try {
      final translations = await _apiService.getPraiseTagTranslations(
        praiseTagId: entityId,
        languageCode: _currentLanguageCode,
      );

      if (translations.isNotEmpty) {
        final translation = translations.first;
        _praiseTagCache[cacheKey] = translation;
        return translation.translatedName;
      }
    } catch (e) {
      // Em caso de erro, retornar fallback
      debugPrint('Erro ao buscar tradução de PraiseTag: $e');
    }

    return fallbackName;
  }

  /// Busca tradução de MaterialType
  /// Retorna o nome traduzido se existir, caso contrário retorna o fallback
  Future<String> getMaterialTypeName(
    String entityId,
    String fallbackName,
  ) async {
    final cacheKey = '${entityId}_$_currentLanguageCode';
    
    // Verificar cache primeiro
    if (_materialTypeCache.containsKey(cacheKey)) {
      return _materialTypeCache[cacheKey]!.translatedName;
    }

    try {
      final translations = await _apiService.getMaterialTypeTranslations(
        materialTypeId: entityId,
        languageCode: _currentLanguageCode,
      );

      if (translations.isNotEmpty) {
        final translation = translations.first;
        _materialTypeCache[cacheKey] = translation;
        return translation.translatedName;
      }
    } catch (e) {
      // Em caso de erro, retornar fallback
      debugPrint('Erro ao buscar tradução de MaterialType: $e');
    }

    return fallbackName;
  }

  /// Carrega todas as traduções de MaterialKinds de uma vez (para otimização)
  Future<void> loadMaterialKindTranslations(List<MaterialKindResponse> kinds) async {
    try {
      final translations = await _apiService.getMaterialKindTranslations(
        languageCode: _currentLanguageCode,
      );

      for (final translation in translations) {
        final cacheKey = '${translation.materialKindId}_$_currentLanguageCode';
        _materialKindCache[cacheKey] = translation;
      }
    } catch (e) {
      debugPrint('Erro ao carregar traduções de MaterialKinds: $e');
    }
  }

  /// Carrega todas as traduções de PraiseTags de uma vez (para otimização)
  Future<void> loadPraiseTagTranslations(List<PraiseTagResponse> tags) async {
    try {
      final translations = await _apiService.getPraiseTagTranslations(
        languageCode: _currentLanguageCode,
      );

      for (final translation in translations) {
        final cacheKey = '${translation.praiseTagId}_$_currentLanguageCode';
        _praiseTagCache[cacheKey] = translation;
      }
    } catch (e) {
      debugPrint('Erro ao carregar traduções de PraiseTags: $e');
    }
  }

  /// Carrega todas as traduções de MaterialTypes de uma vez (para otimização)
  Future<void> loadMaterialTypeTranslations(List<MaterialTypeResponse> types) async {
    try {
      final translations = await _apiService.getMaterialTypeTranslations(
        languageCode: _currentLanguageCode,
      );

      for (final translation in translations) {
        final cacheKey = '${translation.materialTypeId}_$_currentLanguageCode';
        _materialTypeCache[cacheKey] = translation;
      }
    } catch (e) {
      debugPrint('Erro ao carregar traduções de MaterialTypes: $e');
    }
  }

  /// Limpa o cache de traduções
  void clearCache() {
    _materialKindCache.clear();
    _praiseTagCache.clear();
    _materialTypeCache.clear();
  }
}
