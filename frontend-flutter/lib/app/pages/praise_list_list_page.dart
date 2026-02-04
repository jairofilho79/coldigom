import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/praise_list_card.dart';
import '../widgets/praise_list_filters.dart';
import '../widgets/app_button.dart';
import '../providers/praise_list_providers.dart';

/// StateProvider para filtros de busca
final praiseListFiltersProvider = StateProvider<PraiseListQueryParams>((ref) => PraiseListQueryParams());

class PraiseListListPage extends ConsumerWidget {
  const PraiseListListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filters = ref.watch(praiseListFiltersProvider);
    final listsAsync = ref.watch(praiseListsProvider(filters));
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitlePraiseLists),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              context.push('/praise-lists/create');
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Filtros
          Padding(
            padding: const EdgeInsets.all(16),
            child: PraiseListFilters(
              initialFilters: filters,
              onFiltersChanged: (newFilters) {
                ref.read(praiseListFiltersProvider.notifier).state = newFilters;
              },
            ),
          ),
          // Lista de listas
          Expanded(
            child: listsAsync.when(
              data: (lists) {
                if (lists.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AppEmptyWidget(
                          message: filters.name != null || filters.dateFrom != null || filters.dateTo != null
                              ? l10n.messageNoListsFound
                              : l10n.messageNoLists,
                          icon: Icons.list,
                        ),
                        if (filters.name == null && filters.dateFrom == null && filters.dateTo == null) ...[
                          const SizedBox(height: 16),
                          AppButton(
                            text: l10n.actionCreateFirstList,
                            icon: Icons.add,
                            onPressed: () {
                              context.push('/praise-lists/create');
                            },
                          ),
                        ],
                      ],
                    ),
                  );
                }

                // Grid responsivo: 1 coluna mobile, 2 tablet, 3 desktop
                return LayoutBuilder(
                  builder: (context, constraints) {
                    int crossAxisCount = 1;
                    if (constraints.maxWidth > 900) {
                      crossAxisCount = 3;
                    } else if (constraints.maxWidth > 600) {
                      crossAxisCount = 2;
                    }

                    return GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossAxisCount,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                        childAspectRatio: 1.2,
                      ),
                      itemCount: lists.length,
                      itemBuilder: (context, index) {
                        final list = lists[index];
                        return PraiseListCard(
                          list: list,
                          onTap: () {
                            context.push('/praise-lists/${list.id}');
                          },
                        );
                      },
                    );
                  },
                );
              },
              loading: () => const AppLoadingIndicator(message: 'Carregando listas...'),
              error: (error, stack) => AppErrorWidget(
                message: '${l10n.errorLoadPraiseList}: $error',
                onRetry: () {
                  ref.invalidate(praiseListsProvider(filters));
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
