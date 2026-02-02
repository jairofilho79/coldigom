import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api/api_service.dart';
import '../services/translations/entity_translation_service.dart';
import '../stores/language_store.dart';

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
