import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../services/api/api_service.dart';
import '../models/praise_model.dart';

/// Provider para lista de praises
final praisesProvider = FutureProvider.family<List<PraiseResponse>, Map<String, dynamic>>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getPraises(
      skip: params['skip'] as int?,
      limit: params['limit'] as int?,
      name: params['name'] as String?,
      tagId: params['tagId'] as String?,
    );
  },
);

class PraiseListPage extends ConsumerWidget {
  const PraiseListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final praisesAsync = ref.watch(praisesProvider({'skip': 0, 'limit': 50}));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Praises'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              // Navegar para criar praise
              context.push('/praises/create');
            },
          ),
        ],
      ),
      body: praisesAsync.when(
        data: (praises) {
          if (praises.isEmpty) {
            return const AppEmptyWidget(
              message: 'Nenhum praise encontrado',
              icon: Icons.music_note,
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: praises.length,
            itemBuilder: (context, index) {
              final praise = praises[index];
              return AppCard(
                onTap: () {
                  context.push('/praises/${praise.id}');
                },
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            praise.name,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                        ),
                        if (praise.number != null)
                          Chip(
                            label: Text('#${praise.number}'),
                            visualDensity: VisualDensity.compact,
                          ),
                      ],
                    ),
                    if (praise.tags.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 4,
                        children: praise.tags
                            .map((tag) => Chip(
                                  label: Text(tag.name),
                                  visualDensity: VisualDensity.compact,
                                ))
                            .toList(),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      '${praise.materials.length} material(is)',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const AppLoadingIndicator(message: 'Carregando praises...'),
        error: (error, stack) => AppErrorWidget(
          message: 'Erro ao carregar praises: $error',
          onRetry: () {
            ref.invalidate(praisesProvider({'skip': 0, 'limit': 50}));
          },
        ),
      ),
    );
  }
}
