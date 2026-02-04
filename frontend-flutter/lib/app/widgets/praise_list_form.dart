import 'package:flutter/material.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../models/praise_list_model.dart';
import 'app_text_field.dart';

/// Formulário reutilizável para criar/editar praise list
class PraiseListForm extends StatelessWidget {
  final GlobalKey<FormState> formKey;
  final TextEditingController nameController;
  final TextEditingController? descriptionController;
  final bool isPublic;
  final ValueChanged<bool> onIsPublicChanged;
  final bool isLoading;

  const PraiseListForm({
    super.key,
    required this.formKey,
    required this.nameController,
    this.descriptionController,
    required this.isPublic,
    required this.onIsPublicChanged,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final descController = descriptionController ?? TextEditingController();

    return Form(
      key: formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppTextField(
            label: l10n.labelName,
            hint: l10n.hintEnterListName,
            controller: nameController,
            enabled: !isLoading,
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return l10n.validationListNameRequired;
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          AppTextField(
            label: l10n.labelDescription,
            hint: l10n.hintEnterListDescription,
            controller: descController,
            enabled: !isLoading,
            maxLines: 3,
          ),
          const SizedBox(height: 16),
          CheckboxListTile(
            title: Text(l10n.labelPublic),
            value: isPublic,
            onChanged: isLoading ? null : (value) => onIsPublicChanged(value ?? false),
            controlAffinity: ListTileControlAffinity.leading,
          ),
        ],
      ),
    );
  }
}
