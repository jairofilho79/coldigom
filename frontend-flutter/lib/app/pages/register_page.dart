import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../services/api/api_service.dart';
import '../models/user_model.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final apiService = ref.read(apiServiceProvider);
      final userCreate = UserCreate(
        email: _emailController.text.trim(),
        username: _usernameController.text.trim(),
        password: _passwordController.text,
      );

      await apiService.register(userCreate);

      if (mounted) {
        final l10n = AppLocalizations.of(context);
        if (l10n != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(l10n.successRegister),
              backgroundColor: Colors.green,
            ),
          );
        }
        context.go('/login');
      }
    } catch (e) {
      final l10n = AppLocalizations.of(context);
      setState(() {
        _errorMessage = l10n?.errorRegister(e.toString()) ?? 'Erro ao registrar: ${e.toString()}';
      });
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
    
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleRegister),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_errorMessage != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(
                      _errorMessage!,
                      style: TextStyle(color: Colors.red.shade700),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                AppTextField(
                  label: l10n.labelEmail,
                  hint: l10n.hintEnterEmail,
                  controller: _emailController,
                  prefixIcon: Icons.email,
                  keyboardType: TextInputType.emailAddress,
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return l10n.validationEnterEmail;
                    }
                    if (!value.contains('@')) {
                      return l10n.validationValidEmail;
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                AppTextField(
                  label: l10n.labelUsername,
                  hint: l10n.hintEnterUsername,
                  controller: _usernameController,
                  prefixIcon: Icons.person,
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return l10n.validationEnterUsername;
                    }
                    if (value.length < 3) {
                      return l10n.validationUsernameMinLength;
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                AppTextField(
                  label: l10n.labelPassword,
                  hint: l10n.hintEnterPassword,
                  controller: _passwordController,
                  prefixIcon: Icons.lock,
                  obscureText: true,
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return l10n.validationEnterPassword;
                    }
                    if (value.length < 6) {
                      return l10n.validationPasswordMinLength;
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                AppTextField(
                  label: l10n.labelConfirmPassword,
                  hint: l10n.hintConfirmPassword,
                  controller: _confirmPasswordController,
                  prefixIcon: Icons.lock_outline,
                  obscureText: true,
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return l10n.validationConfirmPassword;
                    }
                    if (value != _passwordController.text) {
                      return l10n.validationPasswordMismatch;
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 24),
                AppButton(
                  text: l10n.buttonRegister,
                  onPressed: _handleRegister,
                  isLoading: _isLoading,
                  icon: Icons.person_add,
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () {
                    context.go('/login');
                  },
                  child: Text(l10n.messageHasAccount),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
