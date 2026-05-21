export type SelectOption = { value: string; label: string; disabled?: boolean };

export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function filterOptionsByQuery(options: SelectOption[], query: string): SelectOption[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return options;
  return options.filter((o) => normalizeForSearch(o.label).includes(q));
}
