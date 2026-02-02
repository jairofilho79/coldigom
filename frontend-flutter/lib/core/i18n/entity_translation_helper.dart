import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'entity_translation_providers.dart';
import '../../app/models/translation_model.dart';
import '../../app/stores/language_store.dart';

/// Obtém o nome traduzido de um MaterialKind
/// Retorna o nome traduzido se disponível, senão retorna o fallback
String getMaterialKindName(
  WidgetRef ref,
  String entityId,
  String fallbackName,
) {
  try {
    final languageCode = ref.read(currentLanguageCodeProvider);
    final translationsAsync = ref.read(materialKindTranslationsProvider);
    
    // Se ainda está carregando, retornar fallback
    if (!translationsAsync.hasValue) {
      return fallbackName;
    }
    
    final translations = translationsAsync.value ?? [];
    final translation = translations.firstWhere(
      (t) => t.materialKindId == entityId && t.languageCode == languageCode,
      orElse: () => MaterialKindTranslationResponse(
        id: '',
        languageCode: '',
        translatedName: '',
        materialKindId: '',
      ),
    );
    
    // Se encontrou tradução e tem nome, retornar tradução
    if (translation.translatedName.isNotEmpty) {
      return translation.translatedName;
    }
  } catch (e) {
    // Em caso de erro, retornar fallback
  }
  
  // Caso contrário, retornar fallback
  return fallbackName;
}

/// Obtém o nome traduzido de um PraiseTag
/// Retorna o nome traduzido se disponível, senão retorna o fallback
String getPraiseTagName(
  WidgetRef ref,
  String entityId,
  String fallbackName,
) {
  try {
    final languageCode = ref.read(currentLanguageCodeProvider);
    final translationsAsync = ref.read(praiseTagTranslationsProvider);
    
    // Se ainda está carregando, retornar fallback
    if (!translationsAsync.hasValue) {
      return fallbackName;
    }
    
    final translations = translationsAsync.value ?? [];
    final translation = translations.firstWhere(
      (t) => t.praiseTagId == entityId && t.languageCode == languageCode,
      orElse: () => PraiseTagTranslationResponse(
        id: '',
        languageCode: '',
        translatedName: '',
        praiseTagId: '',
      ),
    );
    
    // Se encontrou tradução e tem nome, retornar tradução
    if (translation.translatedName.isNotEmpty) {
      return translation.translatedName;
    }
  } catch (e) {
    // Em caso de erro, retornar fallback
  }
  
  // Caso contrário, retornar fallback
  return fallbackName;
}

/// Obtém o nome traduzido de um MaterialType
/// Retorna o nome traduzido se disponível, senão retorna o fallback
String getMaterialTypeName(
  WidgetRef ref,
  String entityId,
  String fallbackName,
) {
  try {
    final languageCode = ref.read(currentLanguageCodeProvider);
    final translationsAsync = ref.read(materialTypeTranslationsProvider);
    
    // Se ainda está carregando, retornar fallback
    if (!translationsAsync.hasValue) {
      return fallbackName;
    }
    
    final translations = translationsAsync.value ?? [];
    final translation = translations.firstWhere(
      (t) => t.materialTypeId == entityId && t.languageCode == languageCode,
      orElse: () => MaterialTypeTranslationResponse(
        id: '',
        languageCode: '',
        translatedName: '',
        materialTypeId: '',
      ),
    );
    
    // Se encontrou tradução e tem nome, retornar tradução
    if (translation.translatedName.isNotEmpty) {
      return translation.translatedName;
    }
  } catch (e) {
    // Em caso de erro, retornar fallback
  }
  
  // Caso contrário, retornar fallback
  return fallbackName;
}
