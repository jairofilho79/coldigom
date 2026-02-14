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
import '../services/connectivity_service.dart';
import '../services/offline/praise_cache_service.dart';
import '../models/praise_model.dart';
import '../models/praise_tag_model.dart';
import '../widgets/app_button.dart';

/// Enum para tipo de ordenação
enum SortField {
  name,
  number,
}

/// Enum para direção de ordenação
enum SortDirection {
  ascending,
  descending,
}

/// Enum para comportamento de praises sem número (quando ordena por número)
enum NoNumberBehavior {
  first,   // Por primeiro
  last,    // Por último
  hide,    // Ocultar
}

/// Converte enums de ordenação para strings da API
String _sortFieldToApi(SortField? f) => f == SortField.number ? 'number' : 'name';
String _sortDirectionToApi(SortDirection? d) => d == SortDirection.descending ? 'desc' : 'asc';
String _noNumberToApi(NoNumberBehavior b) {
  switch (b) {
    case NoNumberBehavior.first: return 'first';
    case NoNumberBehavior.last: return 'last';
    case NoNumberBehavior.hide: return 'hide';
  }
}

/// Classe wrapper para parâmetros de busca de praises
/// Implementa == e hashCode para evitar requisições duplicadas
class PraiseQueryParams {
  final int skip;
  final int limit;
  final String? name;
  final String? tagId;
  final String sortBy;
  final String sortDirection;
  final String noNumber;

  PraiseQueryParams({
    required this.skip,
    required this.limit,
    this.name,
    this.tagId,
    this.sortBy = 'name',
    this.sortDirection = 'asc',
    this.noNumber = 'last',
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PraiseQueryParams &&
          runtimeType == other.runtimeType &&
          skip == other.skip &&
          limit == other.limit &&
          name == other.name &&
          tagId == other.tagId &&
          sortBy == other.sortBy &&
          sortDirection == other.sortDirection &&
          noNumber == other.noNumber;

  @override
  int get hashCode =>
      skip.hashCode ^
      limit.hashCode ^
      (name?.hashCode ?? 0) ^
      (tagId?.hashCode ?? 0) ^
      sortBy.hashCode ^
      sortDirection.hashCode ^
      noNumber.hashCode;
}

/// Provider para lista de praises (híbrido: API quando online, cache quando offline)
final praisesProvider = FutureProvider.family<List<PraiseResponse>, PraiseQueryParams>(
  (ref, params) async {
    final apiService = ref.read(apiServiceProvider);
    final connectivityService = ref.read(connectivityServiceProvider);
    final cacheService = ref.read(praiseCacheServiceProvider);

    final isOnline = await connectivityService.isOnline();
    if (isOnline) {
      final praises = await apiService.getPraises(
        skip: params.skip,
        limit: params.limit,
        name: params.name,
        tagId: params.tagId,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
        noNumber: params.noNumber,
      );
      // Sincronizar cache em background (não aguardar)
      _syncPraisesCacheInBackground(apiService, cacheService);
      return praises;
    }

    // Offline: usar cache com filtro/ordenação/paginação
    final cached = cacheService.getCachedPraises();
    if (cached.isEmpty) return [];
    return cacheService.filterAndSort(
      cached,
      name: params.name,
      tagId: params.tagId,
      sortBy: params.sortBy,
      sortDirection: params.sortDirection,
      noNumber: params.noNumber,
      skip: params.skip,
      limit: params.limit,
    );
  },
);

/// Sincroniza cache de praises e tags em background quando online
Future<void> _syncPraisesCacheInBackground(
  ApiService apiService,
  PraiseCacheService cacheService,
) async {
  try {
    final allPraises = await apiService.getAllPraises();
    final tags = await apiService.getTags(limit: 1000);
    await cacheService.saveAllPraises(allPraises);
    await cacheService.saveAllTags(tags);
  } catch (_) {
    // Ignorar erros de sync em background
  }
}

/// Provider para lista de tags (híbrido: API quando online, cache quando offline)
final tagsProvider = FutureProvider<List<PraiseTagResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  final connectivityService = ref.read(connectivityServiceProvider);
  final cacheService = ref.read(praiseCacheServiceProvider);

  final isOnline = await connectivityService.isOnline();
  if (isOnline) {
    final tags = await apiService.getTags(limit: 1000);
    await cacheService.saveAllTags(tags);
    return tags;
  }

  return cacheService.getCachedTags();
});

/// StateProvider para busca
final searchQueryProvider = StateProvider<String>((ref) => '');

/// StateProvider para tag selecionada no filtro
final selectedTagFilterProvider = StateProvider<String?>((ref) => null);

/// StateProvider para campo de ordenação
/// Padrão: Nome
final sortFieldProvider = StateProvider<SortField?>((ref) => SortField.name);

/// StateProvider para direção de ordenação
/// Padrão: Crescente
final sortDirectionProvider = StateProvider<SortDirection?>((ref) => SortDirection.ascending);

/// StateProvider para comportamento de praises sem número (visível apenas quando ordena por número)
/// Padrão: Por último
final noNumberBehaviorProvider = StateProvider<NoNumberBehavior>((ref) => NoNumberBehavior.last);

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

    // Criar novos query params com skip atualizado (mantém sort/filtros)
    final queryParams = PraiseQueryParams(
      skip: _skip,
      limit: _limit,
      name: baseQueryParams.name,
      tagId: baseQueryParams.tagId,
      sortBy: baseQueryParams.sortBy,
      sortDirection: baseQueryParams.sortDirection,
      noNumber: baseQueryParams.noNumber,
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

  void _showFiltersDialog(BuildContext context, WidgetRef ref, AsyncValue<List<PraiseTagResponse>> tagsAsync) {
    final selectedTagId = ref.read(selectedTagFilterProvider);
    final l10n = AppLocalizations.of(context)!;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.labelFilters),
        content: tagsAsync.when(
          data: (tags) {
            if (tags.isEmpty) {
              return const Text('Nenhuma tag disponível');
            }

            return SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Botão "Todas"
                    ListTile(
                      leading: selectedTagId == null
                          ? const Icon(Icons.check, color: Colors.blue)
                          : const SizedBox(width: 24),
                      title: Text(l10n.actionAll),
                      onTap: () {
                        ref.read(selectedTagFilterProvider.notifier).state = null;
                        _resetPagination();
                        Navigator.of(context).pop();
                      },
                    ),
                    const Divider(),
                    // Lista de tags
                    ...tags.map((tag) {
                      final isSelected = selectedTagId == tag.id;
                      final tagName = getPraiseTagName(ref, tag.id, tag.name);
                      return ListTile(
                        leading: isSelected
                            ? const Icon(Icons.check, color: Colors.blue)
                            : const SizedBox(width: 24),
                        title: Text(tagName),
                        onTap: () {
                          ref.read(selectedTagFilterProvider.notifier).state = 
                              isSelected ? null : tag.id;
                          _resetPagination();
                          Navigator.of(context).pop();
                        },
                      );
                    }),
                  ],
                ),
              ),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Text('Erro ao carregar tags: $error'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.buttonClose),
          ),
        ],
      ),
    );
  }

  void _showSortDialog(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          // Ler valores atuais dos providers dentro do StatefulBuilder
          final sortField = ref.read(sortFieldProvider);
          final sortDirection = ref.read(sortDirectionProvider);
          final noNumberBehavior = ref.read(noNumberBehaviorProvider);

          return AlertDialog(
            title: Text(l10n.labelSort),
            content: SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Campo de ordenação
                    Text(
                      l10n.labelSortBy,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    ListTile(
                      leading: sortField == SortField.name
                          ? const Icon(Icons.check, color: Colors.blue)
                          : const SizedBox(width: 24),
                      title: Text(l10n.labelName),
                      onTap: () {
                        setDialogState(() {
                          ref.read(sortFieldProvider.notifier).state = SortField.name;
                          if (ref.read(sortDirectionProvider) == null) {
                            ref.read(sortDirectionProvider.notifier).state = SortDirection.ascending;
                          }
                        });
                      },
                    ),
                    ListTile(
                      leading: sortField == SortField.number
                          ? const Icon(Icons.check, color: Colors.blue)
                          : const SizedBox(width: 24),
                      title: Text(l10n.labelNumber),
                      onTap: () {
                        setDialogState(() {
                          ref.read(sortFieldProvider.notifier).state = SortField.number;
                          if (ref.read(sortDirectionProvider) == null) {
                            ref.read(sortDirectionProvider.notifier).state = SortDirection.ascending;
                          }
                        });
                      },
                    ),
                    const Divider(),
                    // Direção de ordenação
                    Text(
                      l10n.labelDirection,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    ListTile(
                      leading: sortDirection == SortDirection.ascending
                          ? const Icon(Icons.check, color: Colors.blue)
                          : const SizedBox(width: 24),
                      title: Text(l10n.labelAscending),
                      onTap: () {
                        setDialogState(() {
                          ref.read(sortDirectionProvider.notifier).state = SortDirection.ascending;
                          if (ref.read(sortFieldProvider) == null) {
                            ref.read(sortFieldProvider.notifier).state = SortField.name;
                          }
                        });
                      },
                    ),
                    ListTile(
                      leading: sortDirection == SortDirection.descending
                          ? const Icon(Icons.check, color: Colors.blue)
                          : const SizedBox(width: 24),
                      title: Text(l10n.labelDescending),
                      onTap: () {
                        setDialogState(() {
                          ref.read(sortDirectionProvider.notifier).state = SortDirection.descending;
                          if (ref.read(sortFieldProvider) == null) {
                            ref.read(sortFieldProvider.notifier).state = SortField.name;
                          }
                        });
                      },
                    ),
                    if (sortField == SortField.number) ...[
                      const Divider(),
                      Text(
                        l10n.labelWithoutNumber,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      ListTile(
                        leading: noNumberBehavior == NoNumberBehavior.first
                            ? const Icon(Icons.check, color: Colors.blue)
                            : const SizedBox(width: 24),
                        title: Text(l10n.labelWithoutNumberFirst),
                        onTap: () {
                          setDialogState(() {
                            ref.read(noNumberBehaviorProvider.notifier).state = NoNumberBehavior.first;
                          });
                        },
                      ),
                      ListTile(
                        leading: noNumberBehavior == NoNumberBehavior.last
                            ? const Icon(Icons.check, color: Colors.blue)
                            : const SizedBox(width: 24),
                        title: Text(l10n.labelWithoutNumberLast),
                        onTap: () {
                          setDialogState(() {
                            ref.read(noNumberBehaviorProvider.notifier).state = NoNumberBehavior.last;
                          });
                        },
                      ),
                      ListTile(
                        leading: noNumberBehavior == NoNumberBehavior.hide
                            ? const Icon(Icons.check, color: Colors.blue)
                            : const SizedBox(width: 24),
                        title: Text(l10n.labelWithoutNumberHide),
                        onTap: () {
                          setDialogState(() {
                            ref.read(noNumberBehaviorProvider.notifier).state = NoNumberBehavior.hide;
                          });
                        },
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  ref.read(sortFieldProvider.notifier).state = SortField.name;
                  ref.read(sortDirectionProvider.notifier).state = SortDirection.ascending;
                  ref.read(noNumberBehaviorProvider.notifier).state = NoNumberBehavior.last;
                  _resetPagination();
                  Navigator.of(context).pop();
                },
                child: Text(l10n.actionClearFilters),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(l10n.buttonClose),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final searchQuery = ref.watch(searchQueryProvider);
    final selectedTagId = ref.watch(selectedTagFilterProvider);
    final sortField = ref.watch(sortFieldProvider);
    final sortDirection = ref.watch(sortDirectionProvider);
    final noNumberBehavior = ref.watch(noNumberBehaviorProvider);
    
    // Criar queryParams com filtros e ordenação (aplicados no backend)
    final queryParams = PraiseQueryParams(
      skip: 0,
      limit: _limit,
      name: searchQuery.isEmpty ? null : searchQuery,
      tagId: selectedTagId,
      sortBy: _sortFieldToApi(sortField),
      sortDirection: _sortDirectionToApi(sortDirection),
      noNumber: _noNumberToApi(noNumberBehavior),
    );

    final praisesAsync = ref.watch(praisesProvider(queryParams));
    final tagsAsync = ref.watch(tagsProvider);

    final l10n = AppLocalizations.of(context)!;
    
    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitlePraises),
        actions: [
          Builder(
            builder: (context) {
              final isOnlineAsync = ref.watch(connectivityStateProvider);
              final isOnline = isOnlineAsync.value ?? false;
              return IconButton(
                icon: const Icon(Icons.add),
                tooltip: isOnline ? null : 'Criar praise requer conexão',
                onPressed: isOnline ? () => context.push('/praises/create') : null,
              );
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

          // Botões de Filtros e Ordem
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showFiltersDialog(context, ref, tagsAsync),
                    icon: const Icon(Icons.filter_list),
                    label: Text(l10n.labelFilters),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showSortDialog(context, ref),
                    icon: const Icon(Icons.sort),
                    label: Text(l10n.labelSort),
                  ),
                ),
              ],
            ),
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

                // Usar lista atual enquanto processa (backend já retorna ordenado)
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
              loading: () {
                if (_allPraises.isEmpty) {
                  return const AppLoadingIndicator(message: 'Carregando praises...');
                }
                
                return ListView.builder(
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
                    );
              },
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
