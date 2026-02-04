import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_status_widgets.dart';
import '../services/api/api_service.dart';
import '../models/praise_model.dart';
import '../models/praise_tag_model.dart';
import '../widgets/material_manager_widget.dart';
import 'praise_detail_page.dart';
import 'praise_list_page.dart';

/// Provider para lista de tags
final tagsProvider = FutureProvider<List<PraiseTagResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getTags(limit: 1000);
});

class PraiseEditPage extends ConsumerStatefulWidget {
  final String praiseId;

  const PraiseEditPage({
    super.key,
    required this.praiseId,
  });

  @override
  ConsumerState<PraiseEditPage> createState() => _PraiseEditPageState();
}

class _PraiseEditPageState extends ConsumerState<PraiseEditPage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _numberController;
  final Set<String> _selectedTagIds = {};
  bool _isLoading = false;
  bool _isInitialized = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _numberController = TextEditingController();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _numberController.dispose();
    super.dispose();
  }

  void _initializeFromPraise(PraiseResponse praise) {
    if (!_isInitialized) {
      _nameController.text = praise.name;
      if (praise.number != null) {
        _numberController.text = praise.number.toString();
      }
      _selectedTagIds.addAll(praise.tags.map((tag) => tag.id));
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
      
      final praise = PraiseUpdate(
        name: _nameController.text.trim(),
        number: _numberController.text.isEmpty 
            ? null 
            : int.tryParse(_numberController.text.trim()),
        tagIds: _selectedTagIds.isEmpty ? null : _selectedTagIds.toList(),
      );

      await apiService.updatePraise(widget.praiseId, praise);

      // Invalidar providers para atualizar UI
      ref.invalidate(praiseProvider(widget.praiseId));
      ref.invalidate(praisesProvider(PraiseQueryParams(skip: 0, limit: 50)));

      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.successPraiseUpdated)),
        );
        context.go('/praises/${widget.praiseId}');
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorUpdatePraise(e.toString()))),
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

  void _toggleTag(String tagId) {
    setState(() {
      if (_selectedTagIds.contains(tagId)) {
        _selectedTagIds.remove(tagId);
      } else {
        _selectedTagIds.add(tagId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final praiseAsync = ref.watch(praiseProvider(widget.praiseId));
    final tagsAsync = ref.watch(tagsProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleEditPraise),
      ),
      body: praiseAsync.when(
        data: (praise) {
          _initializeFromPraise(praise);
          
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppTextField(
                    label: '${l10n.labelName} *',
                    hint: l10n.hintEnterPraiseName,
                    controller: _nameController,
                    prefixIcon: Icons.music_note,
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return l10n.validationRequired;
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  AppTextField(
                    label: l10n.labelNumber,
                    hint: l10n.hintEnterPraiseNumber,
                    controller: _numberController,
                    keyboardType: TextInputType.number,
                    prefixIcon: Icons.numbers,
                    validator: (value) {
                      if (value != null && value.isNotEmpty) {
                        final number = int.tryParse(value.trim());
                        if (number == null) {
                          return 'Digite um número válido';
                        }
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),
                  Text(
                    l10n.sectionTags,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  tagsAsync.when(
                    data: (tags) {
                      if (tags.isEmpty) {
                        return Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Text(l10n.messageNoTagsAvailable),
                        );
                      }

                      return Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: tags.map((tag) {
                          final isSelected = _selectedTagIds.contains(tag.id);
                          final tagName = getPraiseTagName(ref, tag.id, tag.name);
                          return FilterChip(
                            label: Text(tagName),
                            selected: isSelected,
                            onSelected: (_) => _toggleTag(tag.id),
                          );
                        }).toList(),
                      );
                    },
                    loading: () => AppLoadingIndicator(message: l10n.statusLoading),
                    error: (error, stack) => AppErrorWidget(
                      message: 'Erro ao carregar tags: $error',
                      onRetry: () {
                        ref.invalidate(tagsProvider);
                      },
                    ),
                  ),
                  const SizedBox(height: 24),
                  MaterialManagerWidget(
                    praiseId: widget.praiseId,
                    materials: praise.materials,
                    isEditMode: true,
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
          );
        },
        loading: () => AppLoadingIndicator(message: l10n.statusLoading),
        error: (error, stack) => AppErrorWidget(
          message: 'Erro ao carregar praise: $error',
          onRetry: () {
            ref.invalidate(praiseProvider(widget.praiseId));
          },
        ),
      ),
    );
  }
}
