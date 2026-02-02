import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.tagId != null 
                ? 'Tag atualizada com sucesso' 
                : 'Tag criada com sucesso'),
          ),
        );
        context.go('/tags');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao salvar tag: $e')),
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
        loading: () => Scaffold(
          appBar: AppBar(
            title: const Text('Editar Tag'),
          ),
          body: const AppLoadingIndicator(message: 'Carregando tag...'),
        ),
        error: (error, stack) => Scaffold(
          appBar: AppBar(
            title: const Text('Editar Tag'),
          ),
          body: AppErrorWidget(
            message: 'Erro ao carregar tag: $error',
            onRetry: () {
              ref.invalidate(tagByIdProvider(widget.tagId!));
            },
          ),
        ),
      );
    }

    return _buildForm(context);
  }

  Widget _buildForm(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.tagId != null ? 'Editar Tag' : 'Criar Tag'),
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
                hint: 'Digite o nome da tag',
                controller: _nameController,
                prefixIcon: Icons.label,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'O nome é obrigatório';
                  }
                  if (value.trim().length < 1) {
                    return 'O nome deve ter pelo menos 1 caractere';
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
