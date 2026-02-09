import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../widgets/app_status_widgets.dart';
import '../widgets/batch_download_dialog.dart';
import '../widgets/app_scaffold.dart';
import '../stores/auth_store.dart';
import '../services/offline/download_service.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final l10n = AppLocalizations.of(context)!;

    return AppScaffold(
      appBar: AppBar(
        title: Text(l10n.pageTitleDashboard),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              // Limpar cache de URLs antes de fazer logout
              ref.read(offlineDownloadServiceProvider).clearUrlCache();
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
                            l10n.messageWelcome(authState.user?.username ?? l10n.drawerUser),
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
                        title: l10n.cardPraises,
                        onTap: () => context.push('/praises'),
                      ),
                      _DashboardCard(
                        icon: Icons.label,
                        title: l10n.cardTags,
                        onTap: () => context.push('/tags'),
                      ),
                      _DashboardCard(
                        icon: Icons.folder,
                        title: l10n.cardMaterialKinds,
                        onTap: () => context.push('/material-kinds'),
                      ),
                      _DashboardCard(
                        icon: Icons.download_for_offline,
                        title: 'Download em Lote',
                        onTap: () {
                          showDialog(
                            context: context,
                            builder: (context) => const BatchDownloadDialog(),
                          );
                        },
                      ),
                      _DashboardCard(
                        icon: Icons.list,
                        title: l10n.cardLists,
                        onTap: () {
                          // Navegar para listas
                        },
                      ),
                    ],
                  ),
                ],
              ),
            )
          : AppEmptyWidget(
              message: l10n.messageNotAuthenticated,
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
