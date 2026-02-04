import 'package:flutter/material.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../models/praise_list_model.dart';
import 'app_card.dart';

/// Card para exibir uma praise list
class PraiseListCard extends StatelessWidget {
  final PraiseListResponse list;
  final VoidCallback? onTap;

  const PraiseListCard({
    super.key,
    required this.list,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.list, color: Colors.blue),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  list.name,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              Icon(
                list.isPublic ? Icons.public : Icons.lock,
                size: 20,
                color: Colors.grey,
              ),
            ],
          ),
          if (list.description != null && list.description!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              list.description!,
              style: Theme.of(context).textTheme.bodyMedium,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Text(
                l10n.labelPraisesCount(list.praisesCount),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (list.owner != null) ...[
                const SizedBox(width: 16),
                Text(
                  '${l10n.labelBy} ${list.owner}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
