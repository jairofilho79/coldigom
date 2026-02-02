import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// Store para gerenciar o idioma atual do aplicativo
class LanguageStore extends StateNotifier<String> {
  static const String _boxName = 'language_preferences';
  static const String _languageKey = 'current_language';
  static const String _defaultLanguage = 'pt-BR';

  LanguageStore() : super(_defaultLanguage) {
    _loadLanguage();
  }

  Future<void> _loadLanguage() async {
    try {
      final box = await Hive.openBox(_boxName);
      final savedLanguage = box.get(_languageKey, defaultValue: _defaultLanguage) as String;
      state = savedLanguage;
    } catch (e) {
      // Se houver erro, usar idioma padrão
      state = _defaultLanguage;
    }
  }

  Future<void> setLanguage(String languageCode) async {
    if (state == languageCode) return;

    try {
      final box = await Hive.openBox(_boxName);
      await box.put(_languageKey, languageCode);
      state = languageCode;
    } catch (e) {
      debugPrint('Erro ao salvar idioma: $e');
    }
  }

  String get currentLanguage => state;
  
  /// Converte o código de idioma para Locale
  Locale get locale {
    final parts = state.split('-');
    if (parts.length == 2) {
      return Locale(parts[0], parts[1]);
    }
    return Locale(parts[0]);
  }
}

/// Provider do store de idioma
final languageStoreProvider = StateNotifierProvider<LanguageStore, String>((ref) {
  return LanguageStore();
});

/// Provider para o código de idioma atual (apenas leitura)
final currentLanguageCodeProvider = Provider<String>((ref) {
  return ref.watch(languageStoreProvider);
});

/// Provider para o Locale atual
final currentLocaleProvider = Provider<Locale>((ref) {
  final languageCode = ref.watch(currentLanguageCodeProvider);
  final parts = languageCode.split('-');
  if (parts.length == 2) {
    return Locale(parts[0], parts[1]);
  }
  return Locale(parts[0]);
});
