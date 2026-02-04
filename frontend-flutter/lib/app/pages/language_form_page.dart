import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_status_widgets.dart';
import '../services/api/api_service.dart';
import '../models/language_model.dart';
import 'language_list_page.dart';

/// Provider para buscar uma linguagem específica por código
final languageByCodeProvider = FutureProvider.family<LanguageResponse, String>(
  (ref, code) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getLanguageByCode(code);
  },
);

class LanguageFormPage extends ConsumerStatefulWidget {
  final String? code;

  const LanguageFormPage({
    super.key,
    this.code,
  });

  @override
  ConsumerState<LanguageFormPage> createState() => _LanguageFormPageState();
}

class _LanguageFormPageState extends ConsumerState<LanguageFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  final _nameController = TextEditingController();
  bool _isLoading = false;
  bool _isInitialized = false;
  bool _isActive = true;

  @override
  void dispose() {
    _codeController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _initializeFromLanguage(LanguageResponse language) {
    if (!_isInitialized) {
      _codeController.text = language.code;
      _nameController.text = language.name;
      _isActive = language.isActive;
      setState(() {
        _isInitialized = true;
      });
    }
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final apiService = ref.read(apiServiceProvider);
      final code = _codeController.text.trim();
      final name = _nameController.text.trim();

      if (widget.code != null) {
        // Editar linguagem existente
        final update = LanguageUpdate(
          name: name,
          isActive: _isActive,
        );
        await apiService.updateLanguage(widget.code!, update);
      } else {
        // Criar nova linguagem
        final create = LanguageCreate(
          code: code,
          name: name,
          isActive: _isActive,
        );
        await apiService.createLanguage(create);
      }

      // Invalidar provider para atualizar lista
      ref.invalidate(languagesProvider);

      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.successLanguageSaved),
          ),
        );
        context.go('/languages');
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorSaveLanguage(e.toString()))),
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

  @override
  Widget build(BuildContext context) {
    // Se está editando, carregar linguagem
    if (widget.code != null) {
      final languageAsync = ref.watch(languageByCodeProvider(widget.code!));

      return languageAsync.when(
        data: (language) {
          _initializeFromLanguage(language);
          return _buildForm(context);
        },
        loading: () {
          final l10n = AppLocalizations.of(context)!;
          return Scaffold(
            appBar: AppBar(
              title: Text(l10n.pageTitleEditLanguage),
            ),
            body: AppLoadingIndicator(message: l10n.statusLoading),
          );
        },
        error: (error, stack) {
          final l10n = AppLocalizations.of(context)!;
          return Scaffold(
            appBar: AppBar(
              title: Text(l10n.pageTitleEditLanguage),
            ),
            body: AppErrorWidget(
              message: 'Erro ao carregar linguagem: $error',
              onRetry: () {
                ref.invalidate(languageByCodeProvider(widget.code!));
              },
            ),
          );
        },
      );
    }

    return _buildForm(context);
  }

  Widget _buildForm(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isEditing = widget.code != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(isEditing ? l10n.pageTitleEditLanguage : l10n.pageTitleCreateLanguage),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                label: '${l10n.labelCode} *',
                hint: l10n.hintEnterLanguageCode,
                controller: _codeController,
                prefixIcon: Icons.code,
                enabled: !isEditing, // Desabilitar código ao editar
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return l10n.validationRequired;
                  }
                  if (value.trim().length < 2) {
                    return l10n.validationMinLength(2);
                  }
                  // Validar formato básico (ex: pt-BR, en-US)
                  final codePattern = RegExp(r'^[a-z]{2}(-[A-Z]{2})?$');
                  if (!codePattern.hasMatch(value.trim())) {
                    return 'Formato inválido. Use formato como: pt-BR, en-US';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              AppTextField(
                label: '${l10n.labelName} *',
                hint: l10n.hintEnterLanguageName,
                controller: _nameController,
                prefixIcon: Icons.language,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return l10n.validationRequired;
                  }
                  if (value.trim().length < 1) {
                    return l10n.validationRequired;
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                title: Text(l10n.labelActive),
                subtitle: Text(l10n.messageLanguageAvailable),
                value: _isActive,
                onChanged: (value) {
                  setState(() {
                    _isActive = value;
                  });
                },
                secondary: Icon(
                  _isActive ? Icons.check_circle : Icons.cancel,
                  color: _isActive ? Colors.green : Colors.grey,
                ),
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
}
