import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_status_widgets.dart';
import '../services/api/api_service.dart';
import '../models/praise_tag_model.dart';
import 'tag_list_page.dart';

/// Provider para buscar uma tag específica por ID
final tagByIdProvider = FutureProvider.family<PraiseTagResponse, String>(
  (ref, tagId) async {
    final apiService = ref.read(apiServiceProvider);
    return await apiService.getTagById(tagId);
  },
);

class TagFormPage extends ConsumerStatefulWidget {
  final String? tagId;

  const TagFormPage({
    super.key,
    this.tagId,
  });

  @override
  ConsumerState<TagFormPage> createState() => _TagFormPageState();
}

class _TagFormPageState extends ConsumerState<TagFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  bool _isLoading = false;
  bool _isInitialized = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _initializeFromTag(PraiseTagResponse tag) {
    if (!_isInitialized) {
      _nameController.text = tag.name;
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
      final name = _nameController.text.trim();

      if (widget.tagId != null) {
        // Editar tag existente
        final update = PraiseTagUpdate(name: name);
        await apiService.updateTag(widget.tagId!, update);
      } else {
        // Criar nova tag
        final create = PraiseTagCreate(name: name);
        await apiService.createTag(create);
      }

      // Invalidar provider para atualizar lista
      ref.invalidate(tagsProvider);

      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.successTagSaved),
          ),
        );
        context.go('/tags');
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorSaveTag(e.toString()))),
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
    // Se está editando, carregar tag
    if (widget.tagId != null) {
      final tagAsync = ref.watch(tagByIdProvider(widget.tagId!));

      return tagAsync.when(
        data: (tag) {
          _initializeFromTag(tag);
          return _buildForm(context);
        },
        loading: () {
          final l10n = AppLocalizations.of(context)!;
          return Scaffold(
            appBar: AppBar(
              title: Text(l10n.pageTitleEditTag),
            ),
            body: AppLoadingIndicator(message: l10n.statusLoading),
          );
        },
        error: (error, stack) {
          final l10n = AppLocalizations.of(context)!;
          return Scaffold(
            appBar: AppBar(
              title: Text(l10n.pageTitleEditTag),
            ),
            body: AppErrorWidget(
              message: 'Erro ao carregar tag: $error',
              onRetry: () {
                ref.invalidate(tagByIdProvider(widget.tagId!));
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
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.tagId != null ? l10n.pageTitleEditTag : l10n.pageTitleCreateTag),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                label: '${l10n.labelName} *',
                hint: l10n.hintEnterTagName,
                controller: _nameController,
                prefixIcon: Icons.label,
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
