import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api/api_service.dart';
import '../services/translations/entity_translation_service.dart';
import '../stores/language_store.dart';
import '../models/translation_model.dart';
import '../models/language_model.dart';

/// Provider para o serviço de tradução de entidades
/// Cria uma nova instância quando o idioma muda
final entityTranslationServiceProvider = Provider<EntityTranslationService>((ref) {
  final apiService = ref.watch(apiServiceProvider);
  final languageCode = ref.watch(currentLanguageCodeProvider);
  
  return EntityTranslationService(
    apiService: apiService,
    currentLanguageCode: languageCode,
  );
});

/// Provider para buscar uma tradução de MaterialKind por ID
final materialKindTranslationByIdProvider = FutureProvider.family<
    MaterialKindTranslationResponse, String>(
  (ref, translationId) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getMaterialKindTranslation(translationId);
  },
);

/// Provider para buscar uma tradução de PraiseTag por ID
final praiseTagTranslationByIdProvider = FutureProvider.family<
    PraiseTagTranslationResponse, String>(
  (ref, translationId) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getPraiseTagTranslation(translationId);
  },
);

/// Provider para buscar uma tradução de MaterialType por ID
final materialTypeTranslationByIdProvider = FutureProvider.family<
    MaterialTypeTranslationResponse, String>(
  (ref, translationId) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getMaterialTypeTranslation(translationId);
  },
);

/// Provider para lista de idiomas (reutilizado)
final languagesProvider = FutureProvider<List<LanguageResponse>>(
  (ref) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getLanguages(
      skip: 0,
      limit: 1000,
    );
  },
);
