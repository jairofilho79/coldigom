import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao carregar material kind: $e')),
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.kindId != null
                ? 'Material kind atualizado com sucesso'
                : 'Material kind criado com sucesso'),
          ),
        );
        // Usar go para garantir que a página seja reconstruída e reaja ao provider
        context.go('/material-kinds');
      }
    } catch (e) {
      if (mounted) {
        String errorMessage = 'Erro ao salvar material kind: $e';
        
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
    if (_isLoadingData) {
      return Scaffold(
        appBar: AppBar(
          title: Text(widget.kindId != null ? 'Editar Material Kind' : 'Criar Material Kind'),
        ),
        body: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.kindId != null ? 'Editar Material Kind' : 'Criar Material Kind'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                label: 'Nome *',
                hint: 'Digite o nome do material kind',
                controller: _nameController,
                prefixIcon: Icons.folder,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'O nome é obrigatório';
                  }
                  if (value.trim().length < 1) {
                    return 'O nome deve ter pelo menos 1 caractere';
                  }
                  if (value.trim().length > 255) {
                    return 'O nome deve ter no máximo 255 caracteres';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 32),
              AppButton(
                text: 'Salvar',
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
