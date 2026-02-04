import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/app_card.dart';
import '../services/api/api_service.dart';
import '../models/praise_model.dart';
import '../models/praise_tag_model.dart';
import 'praise_list_page.dart';

/// Provider para lista de tags
final tagsProvider = FutureProvider<List<PraiseTagResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getTags(limit: 1000); // Buscar todas as tags
});

class PraiseCreatePage extends ConsumerStatefulWidget {
  const PraiseCreatePage({super.key});

  @override
  ConsumerState<PraiseCreatePage> createState() => _PraiseCreatePageState();
}

class _PraiseCreatePageState extends ConsumerState<PraiseCreatePage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _numberController = TextEditingController();
  final Set<String> _selectedTagIds = {};
  bool _isLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _numberController.dispose();
    super.dispose();
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
      
      final praise = PraiseCreate(
        name: _nameController.text.trim(),
        number: _numberController.text.isEmpty 
            ? null 
            : int.tryParse(_numberController.text.trim()),
        tagIds: _selectedTagIds.isEmpty ? null : _selectedTagIds.toList(),
      );

      final createdPraise = await apiService.createPraise(praise);

      // Invalidar lista de praises para atualizar
      ref.invalidate(praisesProvider(PraiseQueryParams(skip: 0, limit: 50)));

      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.successPraiseCreated)),
        );
        context.go('/praises/${createdPraise.id}');
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorCreatePraise(e.toString()))),
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
    final tagsAsync = ref.watch(tagsProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleCreatePraise),
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
              Text(
                l10n.sectionMaterials,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              AppCard(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.blue),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Os materiais podem ser adicionados após criar o praise, na página de edição.',
                          style: TextStyle(fontSize: 14),
                        ),
                      ),
                    ],
                  ),
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
