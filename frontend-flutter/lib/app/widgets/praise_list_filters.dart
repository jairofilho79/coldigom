import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../providers/praise_list_providers.dart';
import 'app_text_field.dart';
import 'app_button.dart';

/// Widget de filtros para praise lists
class PraiseListFilters extends ConsumerStatefulWidget {
  final PraiseListQueryParams initialFilters;
  final Function(PraiseListQueryParams) onFiltersChanged;

  const PraiseListFilters({
    super.key,
    required this.initialFilters,
    required this.onFiltersChanged,
  });

  @override
  ConsumerState<PraiseListFilters> createState() => _PraiseListFiltersState();
}

class _PraiseListFiltersState extends ConsumerState<PraiseListFilters> {
  late TextEditingController _nameController;
  DateTime? _dateFrom;
  DateTime? _dateTo;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialFilters.name ?? '');
    if (widget.initialFilters.dateFrom != null) {
      _dateFrom = DateTime.tryParse(widget.initialFilters.dateFrom!);
    }
    if (widget.initialFilters.dateTo != null) {
      _dateTo = DateTime.tryParse(widget.initialFilters.dateTo!);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _applyFilters() {
    widget.onFiltersChanged(
      PraiseListQueryParams(
        name: _nameController.text.trim().isEmpty ? null : _nameController.text.trim(),
        dateFrom: _dateFrom?.toIso8601String().split('T')[0],
        dateTo: _dateTo?.toIso8601String().split('T')[0],
      ),
    );
  }

  void _clearFilters() {
    setState(() {
      _nameController.clear();
      _dateFrom = null;
      _dateTo = null;
    });
    widget.onFiltersChanged(PraiseListQueryParams());
  }

  Future<void> _selectDateFrom(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateFrom ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() {
        _dateFrom = picked;
        if (_dateTo != null && _dateTo!.isBefore(_dateFrom!)) {
          _dateTo = null;
        }
      });
      _applyFilters();
    }
  }

  Future<void> _selectDateTo(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateTo ?? (_dateFrom ?? DateTime.now()),
      firstDate: _dateFrom ?? DateTime(2000),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() {
        _dateTo = picked;
      });
      _applyFilters();
    }
  }

  bool get _hasActiveFilters =>
      _nameController.text.trim().isNotEmpty || _dateFrom != null || _dateTo != null;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.filter_list, color: Colors.blue),
                const SizedBox(width: 8),
                Text(
                  l10n.labelFilters,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            const SizedBox(height: 16),
            AppTextField(
              label: l10n.labelName,
              hint: l10n.hintEnterListName,
              controller: _nameController,
              prefixIcon: Icons.search,
              onSubmitted: _applyFilters,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () => _selectDateFrom(context),
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: l10n.labelDateFrom,
                        prefixIcon: const Icon(Icons.calendar_today),
                        suffixIcon: _dateFrom != null
                            ? IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  setState(() {
                                    _dateFrom = null;
                                  });
                                  _applyFilters();
                                },
                              )
                            : null,
                      ),
                      child: Text(
                        _dateFrom != null
                            ? '${_dateFrom!.day}/${_dateFrom!.month}/${_dateFrom!.year}'
                            : '',
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: InkWell(
                    onTap: () => _selectDateTo(context),
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: l10n.labelDateTo,
                        prefixIcon: const Icon(Icons.calendar_today),
                        suffixIcon: _dateTo != null
                            ? IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  setState(() {
                                    _dateTo = null;
                                  });
                                  _applyFilters();
                                },
                              )
                            : null,
                      ),
                      child: Text(
                        _dateTo != null
                            ? '${_dateTo!.day}/${_dateTo!.month}/${_dateTo!.year}'
                            : '',
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (_hasActiveFilters) ...[
              const SizedBox(height: 16),
              AppButton(
                text: l10n.actionClearFilters,
                icon: Icons.clear,
                onPressed: _clearFilters,
                backgroundColor: Colors.grey,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
