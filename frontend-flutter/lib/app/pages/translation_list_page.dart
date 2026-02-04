import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_card.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_dialog.dart';
import '../widgets/app_scaffold.dart';
import '../services/api/api_service.dart';
import '../models/translation_model.dart';
import '../models/material_kind_model.dart';
import '../models/praise_tag_model.dart';
import '../models/material_type_model.dart';
import '../models/language_model.dart';
import '../providers/material_providers.dart';
import '../providers/translation_providers.dart';

/// Enum para tipos de entidade
enum TranslationEntityType {
  materialKind,
  praiseTag,
  materialType,
}

/// Provider para lista de tags (reutilizado)
final tagsProvider = FutureProvider<List<PraiseTagResponse>>(
  (ref) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getTags(
      skip: 0,
      limit: 1000,
    );
  },
);

/// Provider para traduções de MaterialKind
/// Quando languageCode é null, busca todas as traduções de todos os idiomas
final materialKindTranslationsProvider = FutureProvider.family<
    List<MaterialKindTranslationResponse>, String?>((ref, languageCode) async {
  final apiService = ref.read(apiServiceProvider);
  
  if (languageCode != null) {
    return await apiService.getMaterialKindTranslations(
      languageCode: languageCode,
    );
  }
  
  // Se nenhum idioma selecionado, buscar de todos os idiomas
  final languages = await ref.read(languagesProvider.future);
  
  if (languages.isEmpty) {
    return [];
  }
  
  final allTranslations = <MaterialKindTranslationResponse>[];
  for (final language in languages) {
    try {
      final translations = await apiService.getMaterialKindTranslations(
        languageCode: language.code,
      );
      allTranslations.addAll(translations);
    } catch (e) {
      // Ignorar erros de idiomas sem traduções
    }
  }
  
  return allTranslations;
});

/// Provider para traduções de PraiseTag
/// Quando languageCode é null, busca todas as traduções de todos os idiomas
final praiseTagTranslationsProvider = FutureProvider.family<
    List<PraiseTagTranslationResponse>, String?>((ref, languageCode) async {
  final apiService = ref.read(apiServiceProvider);
  
  if (languageCode != null) {
    return await apiService.getPraiseTagTranslations(
      languageCode: languageCode,
    );
  }
  
  // Se nenhum idioma selecionado, buscar de todos os idiomas
  final languages = await ref.read(languagesProvider.future);
  
  if (languages.isEmpty) {
    return [];
  }
  
  final allTranslations = <PraiseTagTranslationResponse>[];
  for (final language in languages) {
    try {
      final translations = await apiService.getPraiseTagTranslations(
        languageCode: language.code,
      );
      allTranslations.addAll(translations);
    } catch (e) {
      // Ignorar erros de idiomas sem traduções
    }
  }
  
  return allTranslations;
});

/// Provider para traduções de MaterialType
/// Quando languageCode é null, busca todas as traduções de todos os idiomas
final materialTypeTranslationsProvider = FutureProvider.family<
    List<MaterialTypeTranslationResponse>, String?>((ref, languageCode) async {
  final apiService = ref.read(apiServiceProvider);
  
  if (languageCode != null) {
    return await apiService.getMaterialTypeTranslations(
      languageCode: languageCode,
    );
  }
  
  // Se nenhum idioma selecionado, buscar de todos os idiomas
  final languages = await ref.read(languagesProvider.future);
  
  if (languages.isEmpty) {
    return [];
  }
  
  final allTranslations = <MaterialTypeTranslationResponse>[];
  for (final language in languages) {
    try {
      final translations = await apiService.getMaterialTypeTranslations(
        languageCode: language.code,
      );
      allTranslations.addAll(translations);
    } catch (e) {
      // Ignorar erros de idiomas sem traduções
    }
  }
  
  return allTranslations;
});

class TranslationListPage extends ConsumerStatefulWidget {
  const TranslationListPage({super.key});

  @override
  ConsumerState<TranslationListPage> createState() =>
      _TranslationListPageState();
}

class _TranslationListPageState extends ConsumerState<TranslationListPage> {
  TranslationEntityType _selectedEntityType = TranslationEntityType.materialKind;
  String? _selectedLanguageCode;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleTranslations),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showCreateTranslationDialog(context, l10n),
            tooltip: l10n.actionAddTranslation,
          ),
        ],
      ),
      body: Column(
        children: [
          // Filtros
          _buildFilters(context, l10n),
          // Lista de traduções
          Expanded(
            child: _buildTranslationsList(context, l10n),
          ),
        ],
      ),
    );
  }

  Widget _buildFilters(BuildContext context, AppLocalizations l10n) {
    final languagesAsync = ref.watch(languagesProvider);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.labelFilters,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 12),
          // Filtro por tipo de entidade
          Wrap(
            spacing: 8,
            children: [
              _buildEntityTypeChip(
                TranslationEntityType.materialKind,
                l10n.labelMaterialKind,
                Icons.folder,
              ),
              _buildEntityTypeChip(
                TranslationEntityType.praiseTag,
                l10n.labelPraiseTag,
                Icons.label,
              ),
              _buildEntityTypeChip(
                TranslationEntityType.materialType,
                l10n.labelMaterialType,
                Icons.category,
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Filtro por idioma
          languagesAsync.when(
            data: (languages) => DropdownButtonFormField<String?>(
              value: _selectedLanguageCode,
              decoration: InputDecoration(
                labelText: l10n.labelLanguage,
                border: const OutlineInputBorder(),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
              ),
              items: [
                DropdownMenuItem<String?>(
                  value: null,
                  child: Text(l10n.labelAllLanguages),
                ),
                ...languages.map((lang) => DropdownMenuItem<String?>(
                      value: lang.code,
                      child: Text('${lang.name} (${lang.code})'),
                    )),
              ],
              onChanged: (value) {
                setState(() {
                  _selectedLanguageCode = value;
                });
              },
            ),
            loading: () => const SizedBox(
              height: 56,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (error, stack) => Text(
              'Erro ao carregar idiomas: $error',
              style: TextStyle(color: Colors.red[700]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEntityTypeChip(
    TranslationEntityType type,
    String label,
    IconData icon,
  ) {
    final isSelected = _selectedEntityType == type;
    return FilterChip(
      avatar: Icon(icon, size: 18),
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        if (selected) {
          setState(() {
            _selectedEntityType = type;
          });
        }
      },
    );
  }

  Widget _buildTranslationsList(BuildContext context, AppLocalizations l10n) {
    switch (_selectedEntityType) {
      case TranslationEntityType.materialKind:
        return _buildMaterialKindTranslations(context, l10n);
      case TranslationEntityType.praiseTag:
        return _buildPraiseTagTranslations(context, l10n);
      case TranslationEntityType.materialType:
        return _buildMaterialTypeTranslations(context, l10n);
    }
  }

  Widget _buildMaterialKindTranslations(
      BuildContext context, AppLocalizations l10n) {
    final translationsAsync =
        ref.watch(materialKindTranslationsProvider(_selectedLanguageCode));
    final materialKindsAsync = ref.watch(materialKindsProvider);

    return translationsAsync.when(
      data: (translations) {
        if (translations.isEmpty) {
          return AppEmptyWidget(
            message: l10n.messageNoTranslationsAvailable,
            icon: Icons.translate,
          );
        }

        // Ordenar traduções alfabeticamente pelo nome traduzido
        final sortedTranslations = List<MaterialKindTranslationResponse>.from(translations)
          ..sort((a, b) => a.translatedName.toLowerCase().compareTo(b.translatedName.toLowerCase()));

        return materialKindsAsync.when(
          data: (materialKinds) {
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: sortedTranslations.length,
              itemBuilder: (context, index) {
                final translation = sortedTranslations[index];
                final materialKind = materialKinds.firstWhere(
                  (mk) => mk.id == translation.materialKindId,
                  orElse: () => MaterialKindResponse(
                    id: translation.materialKindId,
                    name: l10n.messageUnknown,
                  ),
                );

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: AppCard(
                    child: ListTile(
                      leading: const Icon(Icons.folder),
                      title: Text(translation.translatedName),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${l10n.labelOriginal}: ${materialKind.name}'),
                          Text('${l10n.labelLanguage}: ${translation.languageCode}'),
                        ],
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Chip(
                            label: Text(l10n.labelMaterialKind),
                            backgroundColor: Colors.blue.shade50,
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.edit),
                            onPressed: () {
                              context.push(
                                '/translations/material-kind/${translation.id}/edit',
                              );
                            },
                            tooltip: l10n.tooltipEdit,
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete, color: Colors.red),
                            onPressed: () => _showDeleteDialog(
                              context,
                              ref,
                              translation.id,
                              'material-kind',
                            ),
                            tooltip: l10n.tooltipDelete,
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
            message: 'Erro ao carregar material kinds: $error',
            onRetry: () {
              ref.invalidate(materialKindsProvider);
            },
          ),
        );
      },
      loading: () => AppLoadingIndicator(message: l10n.statusLoading),
      error: (error, stack) => AppErrorWidget(
        message: 'Erro ao carregar traduções: $error',
        onRetry: () {
          ref.invalidate(
            materialKindTranslationsProvider(_selectedLanguageCode),
          );
        },
      ),
    );
  }

  Widget _buildPraiseTagTranslations(
      BuildContext context, AppLocalizations l10n) {
    final translationsAsync =
        ref.watch(praiseTagTranslationsProvider(_selectedLanguageCode));
    final tagsAsync = ref.watch(tagsProvider);

    return translationsAsync.when(
      data: (translations) {
        if (translations.isEmpty) {
          return AppEmptyWidget(
            message: l10n.messageNoTranslationsAvailable,
            icon: Icons.translate,
          );
        }

        // Ordenar traduções alfabeticamente pelo nome traduzido
        final sortedTranslations = List<PraiseTagTranslationResponse>.from(translations)
          ..sort((a, b) => a.translatedName.toLowerCase().compareTo(b.translatedName.toLowerCase()));

        return tagsAsync.when(
          data: (tags) {
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: sortedTranslations.length,
              itemBuilder: (context, index) {
                final translation = sortedTranslations[index];
                final tag = tags.firstWhere(
                  (t) => t.id == translation.praiseTagId,
                  orElse: () => PraiseTagResponse(
                    id: translation.praiseTagId,
                    name: l10n.messageUnknown,
                  ),
                );

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: AppCard(
                    child: ListTile(
                      leading: const Icon(Icons.label),
                      title: Text(translation.translatedName),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${l10n.labelOriginal}: ${tag.name}'),
                          Text('${l10n.labelLanguage}: ${translation.languageCode}'),
                        ],
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Chip(
                            label: Text(l10n.labelPraiseTag),
                            backgroundColor: Colors.green.shade50,
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.edit),
                            onPressed: () {
                              context.push(
                                '/translations/praise-tag/${translation.id}/edit',
                              );
                            },
                            tooltip: l10n.tooltipEdit,
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete, color: Colors.red),
                            onPressed: () => _showDeleteDialog(
                              context,
                              ref,
                              translation.id,
                              'praise-tag',
                            ),
                            tooltip: l10n.tooltipDelete,
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
            message: 'Erro ao carregar tags: $error',
            onRetry: () {
              ref.invalidate(tagsProvider);
            },
          ),
        );
      },
      loading: () => AppLoadingIndicator(message: l10n.statusLoading),
      error: (error, stack) => AppErrorWidget(
        message: 'Erro ao carregar traduções: $error',
        onRetry: () {
          ref.invalidate(
            praiseTagTranslationsProvider(_selectedLanguageCode),
          );
        },
      ),
    );
  }

  Widget _buildMaterialTypeTranslations(
      BuildContext context, AppLocalizations l10n) {
    final translationsAsync =
        ref.watch(materialTypeTranslationsProvider(_selectedLanguageCode));
    final materialTypesAsync = ref.watch(materialTypesProvider);

    return translationsAsync.when(
      data: (translations) {
        if (translations.isEmpty) {
          return AppEmptyWidget(
            message: l10n.messageNoTranslationsAvailable,
            icon: Icons.translate,
          );
        }

        // Ordenar traduções alfabeticamente pelo nome traduzido
        final sortedTranslations = List<MaterialTypeTranslationResponse>.from(translations)
          ..sort((a, b) => a.translatedName.toLowerCase().compareTo(b.translatedName.toLowerCase()));

        return materialTypesAsync.when(
          data: (materialTypes) {
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: sortedTranslations.length,
              itemBuilder: (context, index) {
                final translation = sortedTranslations[index];
                final materialType = materialTypes.firstWhere(
                  (mt) => mt.id == translation.materialTypeId,
                  orElse: () => MaterialTypeResponse(
                    id: translation.materialTypeId,
                    name: l10n.messageUnknown,
                  ),
                );

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: AppCard(
                    child: ListTile(
                      leading: const Icon(Icons.category),
                      title: Text(translation.translatedName),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${l10n.labelOriginal}: ${materialType.name}'),
                          Text('${l10n.labelLanguage}: ${translation.languageCode}'),
                        ],
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Chip(
                            label: Text(l10n.labelMaterialType),
                            backgroundColor: Colors.orange.shade50,
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.edit),
                            onPressed: () {
                              context.push(
                                '/translations/material-type/${translation.id}/edit',
                              );
                            },
                            tooltip: l10n.tooltipEdit,
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete, color: Colors.red),
                            onPressed: () => _showDeleteDialog(
                              context,
                              ref,
                              translation.id,
                              'material-type',
                            ),
                            tooltip: l10n.tooltipDelete,
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
            message: 'Erro ao carregar material types: $error',
            onRetry: () {
              ref.invalidate(materialTypesProvider);
            },
          ),
        );
      },
      loading: () => AppLoadingIndicator(message: l10n.statusLoading),
      error: (error, stack) => AppErrorWidget(
        message: 'Erro ao carregar traduções: $error',
        onRetry: () {
          ref.invalidate(
            materialTypeTranslationsProvider(_selectedLanguageCode),
          );
        },
      ),
    );
  }

  Future<void> _showCreateTranslationDialog(
    BuildContext context,
    AppLocalizations l10n,
  ) async {
    final selectedType = await showDialog<TranslationEntityType>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.pageTitleCreateTranslation),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.folder),
              title: Text(l10n.labelMaterialKind),
              onTap: () => Navigator.of(context).pop(TranslationEntityType.materialKind),
            ),
            ListTile(
              leading: const Icon(Icons.label),
              title: Text(l10n.labelPraiseTag),
              onTap: () => Navigator.of(context).pop(TranslationEntityType.praiseTag),
            ),
            ListTile(
              leading: const Icon(Icons.category),
              title: Text(l10n.labelMaterialType),
              onTap: () => Navigator.of(context).pop(TranslationEntityType.materialType),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.buttonCancel),
          ),
        ],
      ),
    );

    if (selectedType != null && context.mounted) {
      // Mostrar diálogo de seleção de entidade específica
      await _showEntitySelectionDialog(context, l10n, selectedType);
    }
  }

  Future<void> _showEntitySelectionDialog(
    BuildContext context,
    AppLocalizations l10n,
    TranslationEntityType entityType,
  ) async {
    switch (entityType) {
      case TranslationEntityType.materialKind:
        await _showMaterialKindSelectionDialog(context, l10n);
        break;
      case TranslationEntityType.praiseTag:
        await _showPraiseTagSelectionDialog(context, l10n);
        break;
      case TranslationEntityType.materialType:
        await _showMaterialTypeSelectionDialog(context, l10n);
        break;
    }
  }

  Future<void> _showMaterialKindSelectionDialog(
    BuildContext context,
    AppLocalizations l10n,
  ) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        String searchQuery = '';
        return Consumer(
          builder: (context, ref, _) {
            final materialKindsAsync = ref.watch(materialKindsProvider);
            final translationsAsync = ref.watch(materialKindTranslationsProvider(null));
            
            return StatefulBuilder(
              builder: (context, setState) {
                return AlertDialog(
                  title: Text('${l10n.pageTitleCreateTranslation} - ${l10n.labelMaterialKind}'),
                  content: SizedBox(
                    width: double.maxFinite,
                    child: materialKindsAsync.when(
                      data: (materialKinds) {
                        return translationsAsync.when(
                          data: (translations) {
                            // Criar conjunto de IDs que já têm tradução
                            final translatedIds = translations.map((t) => t.materialKindId).toSet();
                            
                            // Filtrar apenas entidades sem tradução
                            final availableKinds = materialKinds.where((mk) {
                              return !translatedIds.contains(mk.id);
                            }).toList();
                            
                            if (availableKinds.isEmpty) {
                              return Padding(
                                padding: const EdgeInsets.all(16),
                                child: Text('Todos os Material Kinds já possuem tradução'),
                              );
                            }
                            
                            // Aplicar filtro de busca
                            final filteredKinds = availableKinds.where((mk) {
                              return mk.name.toLowerCase().contains(searchQuery.toLowerCase());
                            }).toList();
                            
                            return SingleChildScrollView(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  TextField(
                                    decoration: InputDecoration(
                                      labelText: l10n.labelSearch,
                                      prefixIcon: const Icon(Icons.search),
                                      border: const OutlineInputBorder(),
                                    ),
                                    onChanged: (value) {
                                      setState(() {
                                        searchQuery = value;
                                      });
                                    },
                                  ),
                                  const SizedBox(height: 8),
                                  if (filteredKinds.isEmpty)
                                    Padding(
                                      padding: const EdgeInsets.all(16),
                                      child: Text('Nenhum resultado encontrado'),
                                    )
                                  else
                                    ConstrainedBox(
                                      constraints: const BoxConstraints(maxHeight: 400),
                                      child: ListView.builder(
                                        shrinkWrap: true,
                                        physics: const NeverScrollableScrollPhysics(),
                                        itemCount: filteredKinds.length,
                                        itemBuilder: (context, index) {
                                          final materialKind = filteredKinds[index];
                                          return ListTile(
                                            leading: const Icon(Icons.folder),
                                            title: Text(materialKind.name),
                                            onTap: () {
                                              Navigator.of(dialogContext).pop();
                                              context.push(
                                                '/translations/material-kind/create?entityId=${materialKind.id}',
                                              );
                                            },
                                          );
                                        },
                                      ),
                                    ),
                                ],
                              ),
                            );
                          },
                          loading: () => const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(child: CircularProgressIndicator()),
                          ),
                          error: (error, stack) => Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text('Erro ao carregar traduções: $error'),
                          ),
                        );
                      },
                      loading: () => const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                      error: (error, stack) => Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text('Erro ao carregar material kinds: $error'),
                      ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: Text(l10n.buttonCancel),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }

  Future<void> _showPraiseTagSelectionDialog(
    BuildContext context,
    AppLocalizations l10n,
  ) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        String searchQuery = '';
        return Consumer(
          builder: (context, ref, _) {
            final tagsAsync = ref.watch(tagsProvider);
            final translationsAsync = ref.watch(praiseTagTranslationsProvider(null));
            
            return StatefulBuilder(
              builder: (context, setState) {
                return AlertDialog(
                  title: Text('${l10n.pageTitleCreateTranslation} - ${l10n.labelPraiseTag}'),
                  content: SizedBox(
                    width: double.maxFinite,
                    child: tagsAsync.when(
                      data: (tags) {
                        return translationsAsync.when(
                          data: (translations) {
                            // Criar conjunto de IDs que já têm tradução
                            final translatedIds = translations.map((t) => t.praiseTagId).toSet();
                            
                            // Filtrar apenas entidades sem tradução
                            final availableTags = tags.where((tag) {
                              return !translatedIds.contains(tag.id);
                            }).toList();
                            
                            if (availableTags.isEmpty) {
                              return Padding(
                                padding: const EdgeInsets.all(16),
                                child: Text('Todas as Tags já possuem tradução'),
                              );
                            }
                            
                            // Aplicar filtro de busca
                            final filteredTags = availableTags.where((tag) {
                              return tag.name.toLowerCase().contains(searchQuery.toLowerCase());
                            }).toList();
                            
                            return SingleChildScrollView(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  TextField(
                                    decoration: InputDecoration(
                                      labelText: l10n.labelSearch,
                                      prefixIcon: const Icon(Icons.search),
                                      border: const OutlineInputBorder(),
                                    ),
                                    onChanged: (value) {
                                      setState(() {
                                        searchQuery = value;
                                      });
                                    },
                                  ),
                                  const SizedBox(height: 8),
                                  if (filteredTags.isEmpty)
                                    Padding(
                                      padding: const EdgeInsets.all(16),
                                      child: Text('Nenhum resultado encontrado'),
                                    )
                                  else
                                    ConstrainedBox(
                                      constraints: const BoxConstraints(maxHeight: 400),
                                      child: ListView.builder(
                                        shrinkWrap: true,
                                        physics: const NeverScrollableScrollPhysics(),
                                        itemCount: filteredTags.length,
                                        itemBuilder: (context, index) {
                                          final tag = filteredTags[index];
                                          return ListTile(
                                            leading: const Icon(Icons.label),
                                            title: Text(tag.name),
                                            onTap: () {
                                              Navigator.of(dialogContext).pop();
                                              context.push(
                                                '/translations/praise-tag/create?entityId=${tag.id}',
                                              );
                                            },
                                          );
                                        },
                                      ),
                                    ),
                                ],
                              ),
                            );
                          },
                          loading: () => const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(child: CircularProgressIndicator()),
                          ),
                          error: (error, stack) => Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text('Erro ao carregar traduções: $error'),
                          ),
                        );
                      },
                      loading: () => const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                      error: (error, stack) => Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text('Erro ao carregar tags: $error'),
                      ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: Text(l10n.buttonCancel),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }

  Future<void> _showMaterialTypeSelectionDialog(
    BuildContext context,
    AppLocalizations l10n,
  ) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        String searchQuery = '';
        return Consumer(
          builder: (context, ref, _) {
            final materialTypesAsync = ref.watch(materialTypesProvider);
            final translationsAsync = ref.watch(materialTypeTranslationsProvider(null));
            
            return StatefulBuilder(
              builder: (context, setState) {
                return AlertDialog(
                  title: Text('${l10n.pageTitleCreateTranslation} - ${l10n.labelMaterialType}'),
                  content: SizedBox(
                    width: double.maxFinite,
                    child: materialTypesAsync.when(
                      data: (materialTypes) {
                        return translationsAsync.when(
                          data: (translations) {
                            // Criar conjunto de IDs que já têm tradução
                            final translatedIds = translations.map((t) => t.materialTypeId).toSet();
                            
                            // Filtrar apenas entidades sem tradução
                            final availableTypes = materialTypes.where((mt) {
                              return !translatedIds.contains(mt.id);
                            }).toList();
                            
                            if (availableTypes.isEmpty) {
                              return Padding(
                                padding: const EdgeInsets.all(16),
                                child: Text('Todos os Material Types já possuem tradução'),
                              );
                            }
                            
                            // Aplicar filtro de busca
                            final filteredTypes = availableTypes.where((mt) {
                              return mt.name.toLowerCase().contains(searchQuery.toLowerCase());
                            }).toList();
                            
                            return SingleChildScrollView(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  TextField(
                                    decoration: InputDecoration(
                                      labelText: l10n.labelSearch,
                                      prefixIcon: const Icon(Icons.search),
                                      border: const OutlineInputBorder(),
                                    ),
                                    onChanged: (value) {
                                      setState(() {
                                        searchQuery = value;
                                      });
                                    },
                                  ),
                                  const SizedBox(height: 8),
                                  if (filteredTypes.isEmpty)
                                    Padding(
                                      padding: const EdgeInsets.all(16),
                                      child: Text('Nenhum resultado encontrado'),
                                    )
                                  else
                                    ConstrainedBox(
                                      constraints: const BoxConstraints(maxHeight: 400),
                                      child: ListView.builder(
                                        shrinkWrap: true,
                                        physics: const NeverScrollableScrollPhysics(),
                                        itemCount: filteredTypes.length,
                                        itemBuilder: (context, index) {
                                          final materialType = filteredTypes[index];
                                          return ListTile(
                                            leading: const Icon(Icons.category),
                                            title: Text(materialType.name),
                                            onTap: () {
                                              Navigator.of(dialogContext).pop();
                                              context.push(
                                                '/translations/material-type/create?entityId=${materialType.id}',
                                              );
                                            },
                                          );
                                        },
                                      ),
                                    ),
                                ],
                              ),
                            );
                          },
                          loading: () => const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(child: CircularProgressIndicator()),
                          ),
                          error: (error, stack) => Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text('Erro ao carregar traduções: $error'),
                          ),
                        );
                      },
                      loading: () => const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                      error: (error, stack) => Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text('Erro ao carregar material types: $error'),
                      ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: Text(l10n.buttonCancel),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }

  Future<void> _showDeleteDialog(
    BuildContext context,
    WidgetRef ref,
    String translationId,
    String entityType,
  ) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await AppDialog.showConfirm(
      context: context,
      title: l10n.dialogTitleConfirmDelete,
      message: l10n.dialogMessageDeleteTranslation,
      confirmText: l10n.buttonDelete,
    );

    if (confirmed == true) {
      await _deleteTranslation(context, ref, translationId, entityType);
    }
  }

  /// Invalida todos os providers de tradução relevantes
  /// Invalida tanto com o languageCode específico quanto com null para garantir atualização
  Future<void> _invalidateTranslationProviders(
    WidgetRef ref,
    String entityType,
    String? languageCode,
  ) async {
    // Invalidar com o languageCode específico (se fornecido)
    if (languageCode != null) {
      switch (entityType) {
        case 'material-kind':
          ref.invalidate(materialKindTranslationsProvider(languageCode));
          break;
        case 'praise-tag':
          ref.invalidate(praiseTagTranslationsProvider(languageCode));
          break;
        case 'material-type':
          ref.invalidate(materialTypeTranslationsProvider(languageCode));
          break;
      }
    }
    
    // Sempre invalidar também com null (para quando o filtro está em "Todos os idiomas")
    switch (entityType) {
      case 'material-kind':
        ref.invalidate(materialKindTranslationsProvider(null));
        break;
      case 'praise-tag':
        ref.invalidate(praiseTagTranslationsProvider(null));
        break;
      case 'material-type':
        ref.invalidate(materialTypeTranslationsProvider(null));
        break;
    }
    
    // Invalidar também todos os idiomas possíveis para garantir
    try {
      final languages = await ref.read(languagesProvider.future);
      for (final language in languages) {
        switch (entityType) {
          case 'material-kind':
            ref.invalidate(materialKindTranslationsProvider(language.code));
            break;
          case 'praise-tag':
            ref.invalidate(praiseTagTranslationsProvider(language.code));
            break;
          case 'material-type':
            ref.invalidate(materialTypeTranslationsProvider(language.code));
            break;
        }
      }
    } catch (e) {
      // Ignorar erros - a invalidação com null e languageCode específico já foi feita
    }
  }

  Future<void> _deleteTranslation(
    BuildContext context,
    WidgetRef ref,
    String translationId,
    String entityType,
  ) async {
    final l10n = AppLocalizations.of(context)!;
    try {
      final apiService = ref.read(apiServiceProvider);

      switch (entityType) {
        case 'material-kind':
          await apiService.deleteMaterialKindTranslation(translationId);
          await _invalidateTranslationProviders(ref, entityType, _selectedLanguageCode);
          break;
        case 'praise-tag':
          await apiService.deletePraiseTagTranslation(translationId);
          await _invalidateTranslationProviders(ref, entityType, _selectedLanguageCode);
          break;
        case 'material-type':
          await apiService.deleteMaterialTypeTranslation(translationId);
          await _invalidateTranslationProviders(ref, entityType, _selectedLanguageCode);
          break;
      }

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.successTranslationDeleted)),
      );
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.errorDeleteTranslation(e.toString()))),
      );
    }
  }
}
