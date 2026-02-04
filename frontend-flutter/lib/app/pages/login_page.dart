import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:intl/intl.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../stores/auth_store.dart';
import '../services/api/api_service.dart';
import '../models/user_model.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _usernameFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();
  bool _isLoading = false;
  String? _errorMessage;
  PackageInfo? _packageInfo;
  DateTime? _buildTime;

  @override
  void initState() {
    super.initState();
    // Preencher campos com valores de teste
    _usernameController.text = 'teste';
    _passwordController.text = 'teste1';
    _loadPackageInfo();
    _buildTime = DateTime.now(); // Data/hora do build (quando o app foi iniciado)
    
    // Focar no campo de usuário após o primeiro frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _usernameFocusNode.requestFocus();
    });
  }

  Future<void> _loadPackageInfo() async {
    final packageInfo = await PackageInfo.fromPlatform();
    setState(() {
      _packageInfo = packageInfo;
    });
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _usernameFocusNode.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final apiService = ref.read(apiServiceProvider);
      final token = await apiService.login(
        _usernameController.text.trim(),
        _passwordController.text,
      );

      // Obter informações do usuário (simplificado - em produção, fazer requisição separada)
      // Por enquanto, vamos apenas salvar o token
      final authNotifier = ref.read(authProvider.notifier);
      
      // Criar usuário temporário (em produção, buscar do backend)
      final user = UserResponse(
        id: '',
        email: '',
        username: _usernameController.text.trim(),
        isActive: true,
        createdAt: DateTime.now().toIso8601String(),
        updatedAt: DateTime.now().toIso8601String(),
      );

      await authNotifier.login(token.accessToken, user);

      if (mounted) {
        context.go('/');
      }
    } catch (e) {
      final l10n = AppLocalizations.of(context);
      if (l10n == null) return;
      
      String errorMsg = l10n.errorLogin(e.toString());
      
      // Mensagens de erro mais amigáveis
      if (e.toString().contains('Connection failed') || 
          e.toString().contains('SocketException')) {
        errorMsg = l10n.errorConnectionFailed;
      } else if (e.toString().contains('401') || 
                 e.toString().contains('Unauthorized')) {
        errorMsg = l10n.errorInvalidCredentials;
      }
      
      setState(() {
        _errorMessage = errorMsg;
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
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.music_note,
                    size: 80,
                    color: Colors.blue,
                  ),
                  const SizedBox(height: 32),
                  Text(
                    l10n.appName,
                    style: Theme.of(context).textTheme.headlineLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.appSubtitle,
                    style: Theme.of(context).textTheme.bodyLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 48),
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
                    label: l10n.labelUsername,
                    hint: l10n.hintEnterUsername,
                    controller: _usernameController,
                    prefixIcon: Icons.person,
                    focusNode: _usernameFocusNode,
                    textInputAction: TextInputAction.next,
                    onSubmitted: () {
                      // Quando apertar Enter no campo de usuário, focar no campo de senha
                      _passwordFocusNode.requestFocus();
                    },
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return l10n.validationEnterUsername;
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
                    focusNode: _passwordFocusNode,
                    textInputAction: TextInputAction.done,
                    onSubmitted: () {
                      // Quando apertar Enter no campo de senha, fazer login
                      _handleLogin();
                    },
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return l10n.validationEnterPassword;
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),
                  AppButton(
                    text: l10n.buttonEnter,
                    onPressed: _handleLogin,
                    isLoading: _isLoading,
                    icon: Icons.login,
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () {
                      // Navegar para registro
                      context.push('/register');
                    },
                    child: Text(l10n.messageNoAccount),
                  ),
                  const SizedBox(height: 24),
                  // Informações do build
                  if (_buildTime != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          if (_packageInfo != null) ...[
                            Text(
                              l10n.messageVersion(
                                  _packageInfo!.version,
                                  _packageInfo!.buildNumber),
                              style: Theme.of(context).textTheme.bodySmall,
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 4),
                          ],
                          Text(
                            l10n.messageBuild(DateFormat('dd/MM/yyyy HH:mm:ss').format(_buildTime!)),
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey.shade600,
                              fontSize: 11,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
