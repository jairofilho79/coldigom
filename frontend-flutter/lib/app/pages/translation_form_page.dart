import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_status_widgets.dart';
import '../services/api/api_service.dart';
import '../models/translation_model.dart';
import '../models/language_model.dart';
import '../models/material_kind_model.dart';
import '../models/praise_tag_model.dart';
import '../models/material_type_model.dart';
import '../providers/translation_providers.dart';
import '../providers/material_providers.dart';
import 'translation_list_page.dart';

class TranslationFormPage extends ConsumerStatefulWidget {
  final TranslationEntityType entityType;
  final String? translationId;
  final String? entityId;

  const TranslationFormPage({
    super.key,
    required this.entityType,
    this.translationId,
    this.entityId,
  });

  @override
  ConsumerState<TranslationFormPage> createState() =>
      _TranslationFormPageState();
}

class _TranslationFormPageState extends ConsumerState<TranslationFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _translatedNameController = TextEditingController();
  String? _selectedLanguageCode;
  bool _isLoading = false;
  bool _isInitialized = false;
  String? _originalEntityName;
  String? _entityIdFromTranslation;

  @override
  void dispose() {
    _translatedNameController.dispose();
    super.dispose();
  }

  Future<void> _loadTranslation() async {
    if (widget.translationId == null) return;

    try {
      switch (widget.entityType) {
        case TranslationEntityType.materialKind:
          final translation = await ref.read(
            materialKindTranslationByIdProvider(widget.translationId!).future,
          );
          _entityIdFromTranslation = translation.materialKindId;
          _selectedLanguageCode = translation.languageCode;
          _translatedNameController.text = translation.translatedName;
          await _loadOriginalEntityName();
          break;
        case TranslationEntityType.praiseTag:
          final translation = await ref.read(
            praiseTagTranslationByIdProvider(widget.translationId!).future,
          );
          _entityIdFromTranslation = translation.praiseTagId;
          _selectedLanguageCode = translation.languageCode;
          _translatedNameController.text = translation.translatedName;
          await _loadOriginalEntityName();
          break;
        case TranslationEntityType.materialType:
          final translation = await ref.read(
            materialTypeTranslationByIdProvider(widget.translationId!).future,
          );
          _entityIdFromTranslation = translation.materialTypeId;
          _selectedLanguageCode = translation.languageCode;
          _translatedNameController.text = translation.translatedName;
          await _loadOriginalEntityName();
          break;
      }
      setState(() {
        _isInitialized = true;
      });
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorLoadTranslation(e.toString()))),
        );
        context.pop();
      }
    }
  }

  Future<void> _loadOriginalEntityName() async {
    final entityId = widget.entityId ?? _entityIdFromTranslation;
    if (entityId == null) return;

    try {
      final apiService = ref.read(apiServiceProvider);
      switch (widget.entityType) {
        case TranslationEntityType.materialKind:
          final materialKind = await apiService.getMaterialKind(entityId);
          setState(() {
            _originalEntityName = materialKind.name;
          });
          break;
        case TranslationEntityType.praiseTag:
          final tag = await apiService.getTagById(entityId);
          setState(() {
            _originalEntityName = tag.name;
          });
          break;
        case TranslationEntityType.materialType:
          final materialType = await apiService.getMaterialType(entityId);
          setState(() {
            _originalEntityName = materialType.name;
          });
          break;
      }
    } catch (e) {
      // Ignorar erro silenciosamente - nome original não é crítico
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.translationId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _loadTranslation();
      });
    } else {
      // Modo criação - carregar nome original se entityId fornecido
      if (widget.entityId != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _loadOriginalEntityName();
        });
      }
      setState(() {
        _isInitialized = true;
      });
    }
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (widget.translationId == null && _selectedLanguageCode == null) {
      final l10n = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${l10n.labelLanguage} ${l10n.validationRequired}')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final apiService = ref.read(apiServiceProvider);
      final translatedName = _translatedNameController.text.trim();
      final entityId = widget.entityId ?? _entityIdFromTranslation;

      // Obter languageCode para invalidação (já está disponível em _selectedLanguageCode)

      if (widget.translationId != null) {
        // Editar tradução existente
        switch (widget.entityType) {
          case TranslationEntityType.materialKind:
            final update = MaterialKindTranslationUpdate(
              translatedName: translatedName,
            );
            await apiService.updateMaterialKindTranslation(
              widget.translationId!,
              update,
            );
            await _invalidateTranslationProviders(ref, TranslationEntityType.materialKind, _selectedLanguageCode);
            break;
          case TranslationEntityType.praiseTag:
            final update = PraiseTagTranslationUpdate(
              translatedName: translatedName,
            );
            await apiService.updatePraiseTagTranslation(
              widget.translationId!,
              update,
            );
            await _invalidateTranslationProviders(ref, TranslationEntityType.praiseTag, _selectedLanguageCode);
            break;
          case TranslationEntityType.materialType:
            final update = MaterialTypeTranslationUpdate(
              translatedName: translatedName,
            );
            await apiService.updateMaterialTypeTranslation(
              widget.translationId!,
              update,
            );
            await _invalidateTranslationProviders(ref, TranslationEntityType.materialType, _selectedLanguageCode);
            break;
        }
      } else {
        // Criar nova tradução
        if (entityId == null || _selectedLanguageCode == null) {
          throw Exception('Entity ID and language code are required');
        }

        switch (widget.entityType) {
          case TranslationEntityType.materialKind:
            final create = MaterialKindTranslationCreate(
              materialKindId: entityId,
              languageCode: _selectedLanguageCode!,
              translatedName: translatedName,
            );
            await apiService.createMaterialKindTranslation(create);
            await _invalidateTranslationProviders(ref, TranslationEntityType.materialKind, _selectedLanguageCode);
            break;
          case TranslationEntityType.praiseTag:
            final create = PraiseTagTranslationCreate(
              praiseTagId: entityId,
              languageCode: _selectedLanguageCode!,
              translatedName: translatedName,
            );
            await apiService.createPraiseTagTranslation(create);
            await _invalidateTranslationProviders(ref, TranslationEntityType.praiseTag, _selectedLanguageCode);
            break;
          case TranslationEntityType.materialType:
            final create = MaterialTypeTranslationCreate(
              materialTypeId: entityId,
              languageCode: _selectedLanguageCode!,
              translatedName: translatedName,
            );
            await apiService.createMaterialTypeTranslation(create);
            await _invalidateTranslationProviders(ref, TranslationEntityType.materialType, _selectedLanguageCode);
            break;
        }
      }

      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.successTranslationSaved),
          ),
        );
        context.go('/translations');
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        String errorMessage = l10n.errorSaveTranslation(e.toString());
        
        // Verificar se é erro de tradução duplicada
        final errorString = e.toString().toLowerCase();
        if (errorString.contains('400') || 
            errorString.contains('already exists') ||
            errorString.contains('duplicate') ||
            errorString.contains('já existe')) {
          errorMessage = 'Esta entidade já possui uma tradução para este idioma. Cada entidade pode ter apenas uma tradução por idioma.';
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  /// Invalida todos os providers de tradução relevantes
  /// Invalida tanto com o languageCode específico quanto com null para garantir atualização
  Future<void> _invalidateTranslationProviders(
    WidgetRef ref,
    TranslationEntityType entityType,
    String? languageCode,
  ) async {
    // Invalidar com o languageCode específico (se fornecido)
    if (languageCode != null) {
      switch (entityType) {
        case TranslationEntityType.materialKind:
          ref.invalidate(materialKindTranslationsProvider(languageCode));
          break;
        case TranslationEntityType.praiseTag:
          ref.invalidate(praiseTagTranslationsProvider(languageCode));
          break;
        case TranslationEntityType.materialType:
          ref.invalidate(materialTypeTranslationsProvider(languageCode));
          break;
      }
    }
    
    // Sempre invalidar também com null (para quando o filtro está em "Todos os idiomas")
    switch (entityType) {
      case TranslationEntityType.materialKind:
        ref.invalidate(materialKindTranslationsProvider(null));
        break;
      case TranslationEntityType.praiseTag:
        ref.invalidate(praiseTagTranslationsProvider(null));
        break;
      case TranslationEntityType.materialType:
        ref.invalidate(materialTypeTranslationsProvider(null));
        break;
    }
    
    // Invalidar também todos os idiomas possíveis para garantir
    try {
      final languages = await ref.read(languagesProvider.future);
      for (final language in languages) {
        switch (entityType) {
          case TranslationEntityType.materialKind:
            ref.invalidate(materialKindTranslationsProvider(language.code));
            break;
          case TranslationEntityType.praiseTag:
            ref.invalidate(praiseTagTranslationsProvider(language.code));
            break;
          case TranslationEntityType.materialType:
            ref.invalidate(materialTypeTranslationsProvider(language.code));
            break;
        }
      }
    } catch (e) {
      // Ignorar erros - a invalidação com null e languageCode específico já foi feita
    }
  }

  String _getEntityTypeLabel(AppLocalizations l10n) {
    switch (widget.entityType) {
      case TranslationEntityType.materialKind:
        return l10n.labelMaterialKind;
      case TranslationEntityType.praiseTag:
        return l10n.labelPraiseTag;
      case TranslationEntityType.materialType:
        return l10n.labelMaterialType;
    }
  }

  IconData _getEntityTypeIcon() {
    switch (widget.entityType) {
      case TranslationEntityType.materialKind:
        return Icons.folder;
      case TranslationEntityType.praiseTag:
        return Icons.label;
      case TranslationEntityType.materialType:
        return Icons.category;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (!_isInitialized && widget.translationId != null) {
      return Scaffold(
        appBar: AppBar(
          title: Text(l10n.pageTitleEditTranslation),
        ),
        body: AppLoadingIndicator(message: l10n.statusLoading),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.translationId != null
            ? l10n.pageTitleEditTranslation
            : l10n.pageTitleCreateTranslation),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Tipo de entidade (somente leitura)
              AppTextField(
                label: l10n.labelEntityType,
                controller: TextEditingController(text: _getEntityTypeLabel(l10n)),
                prefixIcon: _getEntityTypeIcon(),
                enabled: false,
              ),
              const SizedBox(height: 16),
              // Nome original (somente leitura)
              if (_originalEntityName != null)
                AppTextField(
                  label: l10n.labelOriginal,
                  controller: TextEditingController(text: _originalEntityName),
                  prefixIcon: Icons.text_fields,
                  enabled: false,
                ),
              if (_originalEntityName != null) const SizedBox(height: 16),
              // Idioma (dropdown quando criando, somente leitura quando editando)
              if (widget.translationId == null)
                _buildLanguageDropdown(l10n)
              else
                AppTextField(
                  label: l10n.labelLanguage,
                  controller: TextEditingController(text: _selectedLanguageCode),
                  prefixIcon: Icons.language,
                  enabled: false,
                ),
              const SizedBox(height: 16),
              // Nome traduzido
              AppTextField(
                label: '${l10n.labelTranslatedName} *',
                hint: l10n.hintEnterTranslatedName,
                controller: _translatedNameController,
                prefixIcon: Icons.translate,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return l10n.validationTranslatedNameRequired;
                  }
                  return null;
                },
              ),
              const SizedBox(height: 32),
              AppButton(
                text: l10n.buttonSave,
                icon: Icons.save,
                onPressed: _handleSave,
                isLoading: _isLoading,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLanguageDropdown(AppLocalizations l10n) {
    final languagesAsync = ref.watch(languagesProvider);

    return languagesAsync.when(
      data: (languages) => DropdownButtonFormField<String>(
        value: _selectedLanguageCode,
        decoration: InputDecoration(
          labelText: '${l10n.labelLanguage} *',
          border: const OutlineInputBorder(),
          prefixIcon: const Icon(Icons.language),
        ),
        items: languages.map((lang) {
          return DropdownMenuItem<String>(
            value: lang.code,
            child: Text('${lang.name} (${lang.code})'),
          );
        }).toList(),
        onChanged: (value) {
          setState(() {
            _selectedLanguageCode = value;
          });
        },
        validator: (value) {
          if (value == null || value.isEmpty) {
            return '${l10n.labelLanguage} ${l10n.validationRequired}';
          }
          return null;
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
    );
  }
}
