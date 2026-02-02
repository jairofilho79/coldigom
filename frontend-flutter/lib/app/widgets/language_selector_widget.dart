import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../stores/language_store.dart';

/// Widget para seleção de idioma
/// Pode ser usado no drawer ou em página de preferências
class LanguageSelectorWidget extends ConsumerWidget {
  const LanguageSelectorWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    if (l10n == null) {
      return const SizedBox.shrink();
    }
    
    final currentLanguage = ref.watch(currentLanguageCodeProvider);
    final languageStore = ref.read(languageStoreProvider.notifier);

    // Determinar nome do idioma atual no idioma atual
    String currentLanguageName;
    if (currentLanguage == 'pt-BR') {
      currentLanguageName = l10n.languagePortuguese;
    } else {
      currentLanguageName = l10n.languageEnglish;
    }

    return ListTile(
      leading: const Icon(Icons.language),
      title: Text(l10n.drawerLanguage),
      subtitle: Text(l10n.languageCurrent(currentLanguageName)),
      trailing: DropdownButton<String>(
        value: currentLanguage,
        underline: const SizedBox.shrink(),
        items: const [
          DropdownMenuItem(
            value: 'pt-BR',
            child: Text('Português'),
          ),
          DropdownMenuItem(
            value: 'en-US',
            child: Text('English'),
          ),
        ],
        onChanged: (String? newLanguage) {
          if (newLanguage != null && newLanguage != currentLanguage) {
            languageStore.setLanguage(newLanguage);
          }
        },
      ),
    );
  }
}
