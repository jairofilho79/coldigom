import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/material_kind_download_dialog.dart';
import '../stores/auth_store.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) {
                context.go('/login');
              }
            },
          ),
        ],
      ),
      body: authState.isAuthenticated
          ? SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          const Icon(Icons.person, size: 48),
                          const SizedBox(height: 8),
                          Text(
                            'Bem-vindo, ${authState.user?.username ?? "Usuário"}!',
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    children: [
                      _DashboardCard(
                        icon: Icons.music_note,
                        title: 'Praises',
                        onTap: () => context.push('/praises'),
                      ),
                      _DashboardCard(
                        icon: Icons.label,
                        title: 'Tags',
                        onTap: () {
                          // Navegar para tags
                        },
                      ),
                      _DashboardCard(
                        icon: Icons.folder,
                        title: 'Material Kinds',
                        onTap: () {
                          // Navegar para material kinds
                        },
                      ),
                      _DashboardCard(
                        icon: Icons.download,
                        title: 'Baixar por Material Kind',
                        onTap: () {
                          showDialog(
                            context: context,
                            builder: (context) => const MaterialKindDownloadDialog(),
                          );
                        },
                      ),
                      _DashboardCard(
                        icon: Icons.list,
                        title: 'Listas',
                        onTap: () {
                          // Navegar para listas
                        },
                      ),
                    ],
                  ),
                ],
              ),
            )
          : const AppEmptyWidget(
              message: 'Não autenticado',
              icon: Icons.lock,
            ),
    );
  }
}

class _DashboardCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _DashboardCard({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 48),
              const SizedBox(height: 8),
              Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
