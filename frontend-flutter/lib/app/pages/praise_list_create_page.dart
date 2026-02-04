import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/app_button.dart';
import '../widgets/praise_list_form.dart';
import '../providers/praise_list_providers.dart';
import '../models/praise_list_model.dart';

class PraiseListCreatePage extends ConsumerStatefulWidget {
  const PraiseListCreatePage({super.key});

  @override
  ConsumerState<PraiseListCreatePage> createState() => _PraiseListCreatePageState();
}

class _PraiseListCreatePageState extends ConsumerState<PraiseListCreatePage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  bool _isPublic = false;
  bool _isLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
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
      final create = PraiseListCreate(
        name: _nameController.text.trim(),
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
        isPublic: _isPublic,
      );

      final result = await ref.read(createPraiseListProvider(create).future);

      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.successPraiseListCreated)),
        );
        context.go('/praise-lists/${result.id}');
      }
    } catch (error) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${l10n.errorCreatePraiseList}: $error'),
            backgroundColor: Colors.red,
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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitlePraiseListCreate),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PraiseListForm(
              formKey: _formKey,
              nameController: _nameController,
              descriptionController: _descriptionController,
              isPublic: _isPublic,
              onIsPublicChanged: (value) {
                setState(() {
                  _isPublic = value;
                });
              },
              isLoading: _isLoading,
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                AppButton(
                  text: l10n.buttonCancel,
                  onPressed: _isLoading
                      ? null
                      : () {
                          context.go('/praise-lists');
                        },
                ),
                const SizedBox(width: 16),
                AppButton(
                  text: l10n.buttonCreate,
                  icon: Icons.add,
                  onPressed: _isLoading ? null : _handleSave,
                  isLoading: _isLoading,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
