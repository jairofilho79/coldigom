import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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

    return AppScaffold(
      appBar: AppBar(
        title: const Text('Linguagens'),
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
            return const AppEmptyWidget(
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
                    subtitle: Text('Código: ${language.code}'),
                    leading: Icon(
                      Icons.language,
                      color: language.isActive ? Colors.green : Colors.grey,
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Chip(
                          label: Text(
                            language.isActive ? 'Ativa' : 'Inativa',
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
        loading: () => const AppLoadingIndicator(message: 'Carregando linguagens...'),
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
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: 'Confirmar Exclusão',
      message: 'Tem certeza que deseja excluir a linguagem "${language.name}" (${language.code})? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
    );

    if (confirmed == true) {
      await _deleteLanguage(context, ref, language.code);
    }
  }

  Future<void> _deleteLanguage(BuildContext context, WidgetRef ref, String code) async {
    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.deleteLanguage(code);

      // Invalidar provider para atualizar lista
      ref.invalidate(languagesProvider);

      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Linguagem excluída com sucesso')),
      );
    } catch (e) {
      if (!context.mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao excluir linguagem: $e')),
      );
    }
  }
}
