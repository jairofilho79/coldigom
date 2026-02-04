import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/app_status_widgets.dart';
import '../services/api/api_service.dart';
import '../models/material_type_model.dart';
import '../providers/material_providers.dart';

class MaterialTypeFormPage extends ConsumerStatefulWidget {
  final String? typeId;

  const MaterialTypeFormPage({
    super.key,
    this.typeId,
  });

  @override
  ConsumerState<MaterialTypeFormPage> createState() => _MaterialTypeFormPageState();
}

class _MaterialTypeFormPageState extends ConsumerState<MaterialTypeFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  bool _isLoading = false;
  bool _isLoadingData = false;
  MaterialTypeResponse? _materialType;

  @override
  void initState() {
    super.initState();
    if (widget.typeId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _loadMaterialType();
      });
    }
  }

  Future<void> _loadMaterialType() async {
    if (!mounted) return;
    
    setState(() {
      _isLoadingData = true;
    });

    try {
      final apiService = ref.read(apiServiceProvider);
      final materialType = await apiService.getMaterialType(widget.typeId!);
      if (mounted) {
        setState(() {
          _materialType = materialType;
          _nameController.text = materialType.name;
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
          SnackBar(content: Text(l10n.errorLoadMaterialType(e.toString()))),
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

      if (widget.typeId != null) {
        // Editar material type existente
        final update = MaterialTypeUpdate(name: name);
        await apiService.updateMaterialType(widget.typeId!, update);
      } else {
        // Criar novo material type
        final create = MaterialTypeCreate(name: name);
        await apiService.createMaterialType(create);
      }

      // Invalidar provider para atualizar lista
      ref.invalidate(materialTypesProvider);

      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.successMaterialTypeSaved),
          ),
        );
        // Usar go para garantir que a página seja reconstruída e reaja ao provider
        context.go('/material-types');
      }
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        String errorMessage = l10n.errorSaveMaterialType(e.toString());
        
        // Tratar erro específico de nome duplicado
        if (e.toString().contains('400') || e.toString().contains('already exists')) {
          errorMessage = 'Já existe um material type com este nome';
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
          title: Text(widget.typeId != null ? l10n.pageTitleEditMaterialType : l10n.pageTitleCreateMaterialType),
        ),
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.typeId != null ? l10n.pageTitleEditMaterialType : l10n.pageTitleCreateMaterialType),
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
                hint: l10n.hintEnterMaterialTypeName,
                controller: _nameController,
                prefixIcon: Icons.category,
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
