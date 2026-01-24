import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../../core/config/hive_config.dart';
import '../../core/constants/app_constants.dart';

/// Provider de preferências do usuário
final preferencesProvider =
    StateNotifierProvider<PreferencesNotifier, PreferencesState>((ref) {
  return PreferencesNotifier();
});

class PreferencesState {
  final String language;

  PreferencesState({
    required this.language,
  });

  PreferencesState copyWith({
    String? language,
  }) {
    return PreferencesState(
      language: language ?? this.language,
    );
  }
}

class PreferencesNotifier extends StateNotifier<PreferencesState> {
  PreferencesNotifier()
      : super(PreferencesState(language: AppConstants.defaultLanguage)) {
    _loadPreferences();
  }

  void _loadPreferences() {
    final preferencesBox = Hive.box(HiveConfig.preferencesBoxName);
    final language = preferencesBox.get(
      AppConstants.languageKey,
      defaultValue: AppConstants.defaultLanguage,
    ) as String;

    state = PreferencesState(language: language);
  }

  Future<void> setLanguage(String language) async {
    final preferencesBox = Hive.box(HiveConfig.preferencesBoxName);
    await preferencesBox.put(AppConstants.languageKey, language);

    state = state.copyWith(language: language);
  }
}
