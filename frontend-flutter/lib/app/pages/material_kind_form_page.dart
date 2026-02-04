import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../core/i18n/entity_translation_helper.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_status_widgets.dart';
import '../services/api/api_service.dart';
import '../models/material_kind_model.dart';
import '../providers/material_providers.dart';

class MaterialKindFormPage extends ConsumerStatefulWidget {
  final String? kindId;

  const MaterialKindFormPage({
    super.key,
    this.kindId,
  });

  @override
  ConsumerState<MaterialKindFormPage> createState() => _MaterialKindFormPageState();
}

class _MaterialKindFormPageState extends ConsumerState<MaterialKindFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  bool _isLoading = false;
  bool _isLoadingData = false;
  MaterialKindResponse? _materialKind;

  @override
  void initState() {
    super.initState();
    if (widget.kindId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _loadMaterialKind();
      });
    }
  }

  Future<void> _loadMaterialKind() async {
    if (!mounted) return;
    
    setState(() {
      _isLoadingData = true;
    });

    try {
      final apiService = ref.read(apiServiceProvider);
      final materialKind = await apiService.getMaterialKind(widget.kindId!);
      if (mounted) {
        setState(() {
          _materialKind = materialKind;
          _nameController.text = materialKind.name;
          _isLoadingData = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoadingData = false;
        });
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorLoadMaterialKind(e.toString()))),
        );
        context.pop();
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
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
      final name = _nameController.text.trim();

      if (widget.kindId != null) {
        // Editar material kind existente
        final update = MaterialKindUpdate(name: name);
        await apiService.updateMaterialKind(widget.kindId!, update);
      } else {
        // Criar novo material kind
        final create = MaterialKindCreate(name: name);
        await apiService.createMaterialKind(create);
      }

      // Invalidar provider para atualizar lista
      ref.invalidate(materialKindsProvider);

      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.successMaterialKindSaved),
          ),
        );
        // Usar go para garantir que a página seja reconstruída e reaja ao provider
        context.go('/material-kinds');
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        String errorMessage = l10n.errorSaveMaterialKind(e.toString());
        
        // Tratar erro específico de nome duplicado
        if (e.toString().contains('400') || e.toString().contains('already exists')) {
          errorMessage = 'Já existe um material kind com este nome';
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(errorMessage)),
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
    
    if (_isLoadingData) {
      return Scaffold(
        appBar: AppBar(
          title: Text(widget.kindId != null ? l10n.pageTitleEditMaterialKind : l10n.pageTitleCreateMaterialKind),
        ),
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.kindId != null ? l10n.pageTitleEditMaterialKind : l10n.pageTitleCreateMaterialKind),
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
                hint: l10n.hintEnterMaterialKindName,
                controller: _nameController,
                prefixIcon: Icons.folder,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return l10n.validationRequired;
                  }
                  if (value.trim().length < 1) {
                    return l10n.validationRequired;
                  }
                  if (value.trim().length > 255) {
                    return l10n.validationMaxLength(255);
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
