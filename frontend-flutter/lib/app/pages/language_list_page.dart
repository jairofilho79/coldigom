import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_dialog.dart';
import '../widgets/app_scaffold.dart';
import '../services/api/api_service.dart';
import '../models/language_model.dart';

/// Provider para lista de linguagens
final languagesProvider = FutureProvider<List<LanguageResponse>>(
  (ref) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getLanguages(
      skip: 0,
      limit: 1000,
    );
  },
);

class LanguageListPage extends ConsumerWidget {
  const LanguageListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final languagesAsync = ref.watch(languagesProvider);
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleLanguages),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              context.push('/languages/create');
            },
          ),
        ],
      ),
      body: languagesAsync.when(
        data: (languages) {
          if (languages.isEmpty) {
            return AppEmptyWidget(
              message: 'Nenhuma linguagem encontrada',
              icon: Icons.language,
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: languages.length,
            itemBuilder: (context, index) {
              final language = languages[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AppCard(
                  child: ListTile(
                    title: Text(language.name),
                    subtitle: Text(l10n.messageCode(language.code)),
                    leading: Icon(
                      Icons.language,
                      color: language.isActive ? Colors.green : Colors.grey,
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Chip(
                          label: Text(
                            language.isActive ? l10n.labelActive : 'Inativa',
                            style: TextStyle(
                              color: language.isActive 
                                  ? Colors.green.shade700 
                                  : Colors.grey.shade700,
                              fontSize: 12,
                            ),
                          ),
                          backgroundColor: language.isActive 
                              ? Colors.green.shade50 
                              : Colors.grey.shade200,
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Icon(Icons.edit),
                          onPressed: () {
                            context.push('/languages/${language.code}/edit');
                          },
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          onPressed: () => _showDeleteDialog(context, ref, language),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
        loading: () => AppLoadingIndicator(message: l10n.statusLoading),
        error: (error, stack) => AppErrorWidget(
          message: 'Erro ao carregar linguagens: $error',
          onRetry: () {
            ref.invalidate(languagesProvider);
          },
        ),
      ),
    );
  }

  Future<void> _showDeleteDialog(BuildContext context, WidgetRef ref, LanguageResponse language) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: l10n.dialogTitleConfirmDelete,
      message: l10n.dialogMessageDeleteLanguage,
      confirmText: l10n.buttonDelete,
    );

    if (confirmed == true) {
      await _deleteLanguage(context, ref, language.code);
    }
  }

  Future<void> _deleteLanguage(BuildContext context, WidgetRef ref, String code) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deleteLanguage(code);

      // Invalidar provider para atualizar lista
      ref.invalidate(languagesProvider);

      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.successLanguageDeleted)),
      );
    } catch (e) {
      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.errorDeleteLanguage(e.toString()))),
      );
    }
  }
}
