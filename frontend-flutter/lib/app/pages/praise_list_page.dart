import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_scaffold.dart';
import '../services/api/api_service.dart';
import '../models/praise_model.dart';
import '../models/praise_tag_model.dart';
import '../widgets/app_button.dart';

/// Classe wrapper para parâmetros de busca de praises
/// Implementa == e hashCode para evitar requisições duplicadas
class PraiseQueryParams {
  final int skip;
  final int limit;
  final String? name;
  final String? tagId;

  PraiseQueryParams({
    required this.skip,
    required this.limit,
    this.name,
    this.tagId,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PraiseQueryParams &&
          runtimeType == other.runtimeType &&
          skip == other.skip &&
          limit == other.limit &&
          name == other.name &&
          tagId == other.tagId;

  @override
  int get hashCode => skip.hashCode ^ limit.hashCode ^ (name?.hashCode ?? 0) ^ (tagId?.hashCode ?? 0);
}

/// Provider para lista de praises
final praisesProvider = FutureProvider.family<List<PraiseResponse>, PraiseQueryParams>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getPraises(
      skip: params.skip,
      limit: params.limit,
      name: params.name,
      tagId: params.tagId,
    );
  },
);

/// Provider para lista de tags (para filtros)
final tagsProvider = FutureProvider<List<PraiseTagResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getTags(limit: 1000);
});

/// StateProvider para busca
final searchQueryProvider = StateProvider<String>((ref) => '');

/// StateProvider para tag selecionada no filtro
final selectedTagFilterProvider = StateProvider<String?>((ref) => null);

class PraiseListPage extends ConsumerStatefulWidget {
  const PraiseListPage({super.key});

  @override
  ConsumerState<PraiseListPage> createState() => _PraiseListPageState();
}

class _PraiseListPageState extends ConsumerState<PraiseListPage> {
  final _searchController = TextEditingController();
  Timer? _debounceTimer;
  int _skip = 0;
  final int _limit = 50;
  final List<PraiseResponse> _allPraises = [];
  bool _isLoadingMore = false;
  bool _hasMore = true;
  PraiseQueryParams? _lastQueryParams; // Rastrear último query params usado
  bool _hasReadUrlParams = false; // Flag para ler URL apenas uma vez

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Ler tagId da URL quando a página é aberta (apenas uma vez)
    if (!_hasReadUrlParams) {
      _hasReadUrlParams = true;
      final uri = GoRouterState.of(context).uri;
      final tagIdFromUrl = uri.queryParameters['tagId'];
      if (tagIdFromUrl != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            ref.read(selectedTagFilterProvider.notifier).state = tagIdFromUrl;
            _resetPagination();
          }
        });
      }
    }
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    if (_debounceTimer?.isActive ?? false) _debounceTimer!.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      ref.read(searchQueryProvider.notifier).state = _searchController.text.trim();
      _resetPagination();
    });
  }

  void _resetPagination() {
    setState(() {
      _skip = 0;
      _allPraises.clear();
      _hasMore = true;
      _isLoadingMore = false;
      _lastQueryParams = null; // Resetar para forçar atualização
    });
  }

  void _loadMore(BuildContext context, WidgetRef ref, PraiseQueryParams baseQueryParams) {
    if (_isLoadingMore || !_hasMore) return;

    setState(() {
      _isLoadingMore = true;
      _skip += _limit;
    });

    // Criar novos query params com skip atualizado
    final queryParams = PraiseQueryParams(
      skip: _skip,
      limit: _limit,
      name: baseQueryParams.name,
      tagId: baseQueryParams.tagId,
    );

    // Buscar mais dados
    ref.read(praisesProvider(queryParams).future).then((newPraises) {
      if (mounted) {
        setState(() {
          _allPraises.addAll(newPraises);
          _hasMore = newPraises.length == _limit;
          _isLoadingMore = false;
        });
      }
    }).catchError((error) {
      if (mounted) {
        setState(() {
          _isLoadingMore = false;
          _skip -= _limit; // Reverter skip em caso de erro
        });
        final l10n = AppLocalizations.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao carregar mais: $error')),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final searchQuery = ref.watch(searchQueryProvider);
    final selectedTagId = ref.watch(selectedTagFilterProvider);
    
    // Criar queryParams usando classe wrapper que implementa == e hashCode
    // Isso evita requisições duplicadas porque o Riverpod pode comparar corretamente
    final queryParams = PraiseQueryParams(
      skip: 0, // Sempre começar do início, paginação será feita via estado local
      limit: _limit,
      name: searchQuery.isEmpty ? null : searchQuery,
      tagId: selectedTagId,
    );

    final praisesAsync = ref.watch(praisesProvider(queryParams));
    final tagsAsync = ref.watch(tagsProvider);

    final l10n = AppLocalizations.of(context)!;
    
    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitlePraises),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              context.push('/praises/create');
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Barra de busca
          Padding(
            padding: const EdgeInsets.all(16),
            child: AppTextField(
              label: l10n.labelSearch,
              hint: l10n.hintEnterSearchPraise,
              controller: _searchController,
              prefixIcon: Icons.search,
            ),
          ),

          // Filtros de tags
          tagsAsync.when(
            data: (tags) {
              if (tags.isEmpty) {
                return const SizedBox.shrink();
              }

              return Container(
                height: 50,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    // Botão "Todas"
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(l10n.actionAll),
                        selected: selectedTagId == null,
                        onSelected: (_) {
                          ref.read(selectedTagFilterProvider.notifier).state = null;
                          _resetPagination();
                        },
                      ),
                    ),
                    // Chips de tags
                    ...tags.map((tag) {
                      final isSelected = selectedTagId == tag.id;
                      final tagName = getPraiseTagName(ref, tag.id, tag.name);
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          label: Text(tagName),
                          selected: isSelected,
                          onSelected: (_) {
                            ref.read(selectedTagFilterProvider.notifier).state = 
                                isSelected ? null : tag.id;
                            _resetPagination();
                          },
                        ),
                      );
                    }),
                  ],
                ),
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),

          // Lista de praises
          Expanded(
            child: praisesAsync.when(
              data: (praises) {
                // Atualizar lista apenas quando os query params mudaram (busca/filtro mudou)
                // Isso evita múltiplas atualizações e requisições
                final queryParamsChanged = _lastQueryParams != queryParams;
                
                if (queryParamsChanged && _skip == 0) {
                  // Query params mudaram, atualizar lista
                  _lastQueryParams = queryParams;
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted && _lastQueryParams == queryParams) {
                      setState(() {
                        _allPraises.clear();
                        _allPraises.addAll(praises);
                        _hasMore = praises.length == _limit;
                        _isLoadingMore = false;
                        _skip = 0;
                      });
                    }
                  });
                }

                // Usar lista atual enquanto processa
                final currentPraises = _allPraises.isEmpty ? praises : _allPraises;

                if (currentPraises.isEmpty) {
                  return AppEmptyWidget(
                    message: 'Nenhum praise encontrado',
                    icon: Icons.music_note,
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: currentPraises.length + (_hasMore && !_isLoadingMore ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (index == currentPraises.length) {
                      // Botão "Carregar mais"
                      return Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Center(
                          child: AppButton(
                            text: 'Carregar mais',
                            icon: Icons.expand_more,
                            onPressed: () => _loadMore(context, ref, queryParams),
                          ),
                        ),
                      );
                    }

                    final praise = currentPraises[index];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AppCard(
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
                                    label: Text(l10n.badgeNumber(praise.number ?? 0)),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                if (praise.inReview)
                                  Padding(
                                    padding: const EdgeInsets.only(left: 8),
                                    child: Chip(
                                      label: Text(l10n.badgeInReview),
                                      visualDensity: VisualDensity.compact,
                                      backgroundColor: Colors.orange.shade100,
                                    ),
                                  ),
                              ],
                            ),
                            if (praise.tags.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 4,
                                children: praise.tags
                                    .map((tag) {
                                      final tagName = getPraiseTagName(ref, tag.id, tag.name);
                                      return ActionChip(
                                        label: Text(tagName),
                                        visualDensity: VisualDensity.compact,
                                        onPressed: () {
                                          // Navegar para lista de praises filtrada por esta tag
                                          context.push('/praises?tagId=${tag.id}');
                                        },
                                      );
                                    })
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
                      ),
                    );
                  },
                );
              },
              loading: () => _allPraises.isEmpty 
                  ? const AppLoadingIndicator(message: 'Carregando praises...')
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _allPraises.length + 1,
                      itemBuilder: (context, index) {
                        if (index == _allPraises.length) {
                          return const Padding(
                            padding: EdgeInsets.all(16.0),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        final praise = _allPraises[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: AppCard(
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
                                    if (praise.inReview)
                                      Padding(
                                        padding: const EdgeInsets.only(left: 8),
                                        child: Chip(
                                          label: const Text('Em Revisão'),
                                          visualDensity: VisualDensity.compact,
                                          backgroundColor: Colors.orange.shade100,
                                        ),
                                      ),
                                  ],
                                ),
                                if (praise.tags.isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  Wrap(
                                    spacing: 4,
                                    children: praise.tags
                                        .map((tag) {
                                          final tagName = getPraiseTagName(ref, tag.id, tag.name);
                                          return ActionChip(
                                            label: Text(tagName),
                                            visualDensity: VisualDensity.compact,
                                            onPressed: () {
                                              // Navegar para lista de praises filtrada por esta tag
                                              context.push('/praises?tagId=${tag.id}');
                                            },
                                          );
                                        })
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
                          ),
                        );
                      },
                    ),
              error: (error, stack) {
                // Se o erro for 401 (não autorizado), não exibir o erro
                // O redirecionamento para login já será feito pelo GoRouter
                if (isUnauthorizedError(error)) {
                  // Retornar um widget vazio enquanto redireciona
                  // O GoRouter vai redirecionar automaticamente quando detectar que não está autenticado
                  return const SizedBox.shrink();
                }
                
                return AppErrorWidget(
                  message: 'Erro ao carregar praises: $error',
                  onRetry: () {
                    _resetPagination();
                    ref.invalidate(praisesProvider(queryParams));
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
