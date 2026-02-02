import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app/services/api/api_service.dart';
import '../../app/models/translation_model.dart';
import '../../app/stores/language_store.dart';

/// Provider para traduções de MaterialKind
/// Observa o idioma atual e busca traduções quando o idioma muda
final materialKindTranslationsProvider = FutureProvider<List<MaterialKindTranslationResponse>>((ref) async {
  final languageCode = ref.watch(currentLanguageCodeProvider);
  final apiService = ref.read(apiServiceProvider);
  
  try {
    return await apiService.getMaterialKindTranslations(
      languageCode: languageCode,
    );
  } catch (e) {
    // Retornar lista vazia em caso de erro (fallback graceful)
    return [];
  }
});

/// Provider para traduções de PraiseTag
/// Observa o idioma atual e busca traduções quando o idioma muda
final praiseTagTranslationsProvider = FutureProvider<List<PraiseTagTranslationResponse>>((ref) async {
  final languageCode = ref.watch(currentLanguageCodeProvider);
  final apiService = ref.read(apiServiceProvider);
  
  try {
    return await apiService.getPraiseTagTranslations(
      languageCode: languageCode,
    );
  } catch (e) {
    // Retornar lista vazia em caso de erro (fallback graceful)
    return [];
  }
});

/// Provider para traduções de MaterialType
/// Observa o idioma atual e busca traduções quando o idioma muda
final materialTypeTranslationsProvider = FutureProvider<List<MaterialTypeTranslationResponse>>((ref) async {
  final languageCode = ref.watch(currentLanguageCodeProvider);
  final apiService = ref.read(apiServiceProvider);
  
  try {
    return await apiService.getMaterialTypeTranslations(
      languageCode: languageCode,
    );
  } catch (e) {
    // Retornar lista vazia em caso de erro (fallback graceful)
    return [];
  }
});
