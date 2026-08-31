import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { filterOptionsByQuery, type SelectOption } from './selectTypes';

export type SearchableSelectProps = {
  id?: string;
  label?: string;
  'aria-label'?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
};

function getEnabledIndices(options: SelectOption[]): number[] {
  return options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
}

export function SearchableSelect({
  id,
  label,
  'aria-label': ariaLabel,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = 'Buscar…',
  disabled = false,
  className,
  compact = false,
}: SearchableSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const searchId = `${selectId}-search`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const filtered = filterOptionsByQuery(options, query);
  const filteredWithIndex = filtered.map((opt) => ({
    opt,
    index: options.findIndex((o) => o.value === opt.value),
  }));

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? '';
  const isPlaceholder = !value || !selected;

  /** Índice, na lista original, do primeiro resultado habilitado para a busca dada. */
  const primeiroResultado = (busca: string): number => {
    const primeiro = filterOptionsByQuery(options, busca).find((o) => !o.disabled);
    return primeiro ? options.findIndex((o) => o.value === primeiro.value) : -1;
  };

  /**
   * Reposicionar o destaque é pergunta de dois momentos — abrir e digitar — e
   * não de todo render. Por isso mora nos handlers, não num efeito.
   */
  const abrir = () => {
    setQuery('');
    setFocusedIndex(primeiroResultado(''));
    setOpen(true);
  };

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setFocusedIndex(-1);
  }, []);

  const selectOption = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      close();
    },
    [onChange, close]
  );

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, close]);

  /**
   * O foco entra no campo de busca ao abrir. Depende só de `open`: antes este
   * efeito também tinha `filteredWithIndex` nas dependências — um array
   * recriado a cada render — então rodava depois de todo commit e arrancava o
   * foco de volta para o campo sempre que o mouse passava numa opção.
   */
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const enabledIndices = getEnabledIndices(
    filteredWithIndex.map(({ opt }) => opt)
  ).map((fi) => filteredWithIndex[fi]?.index ?? -1).filter((i) => i >= 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        abrir();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    if (enabledIndices.length === 0) return;

    const currentPos = enabledIndices.indexOf(focusedIndex);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = currentPos < enabledIndices.length - 1 ? currentPos + 1 : 0;
      setFocusedIndex(enabledIndices[next]!);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = currentPos > 0 ? currentPos - 1 : enabledIndices.length - 1;
      setFocusedIndex(enabledIndices[prev]!);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[focusedIndex];
      if (opt && !opt.disabled) selectOption(opt);
    }
  };

  const rootClass = [
    'app-select',
    compact ? 'app-select--compact' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const accessibleName = label ?? ariaLabel;

  return (
    <div className={rootClass} ref={rootRef}>
      {label ? (
        <label htmlFor={selectId} className="app-select-label" id={`${selectId}-label`}>
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={selectId}
        className={`app-select-trigger${isPlaceholder ? ' is-placeholder' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={label ? `${selectId}-label` : undefined}
        aria-label={!label ? ariaLabel : undefined}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else abrir();
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="app-select-value">{displayLabel}</span>
      </button>
      {open && (
        <div
          id={listboxId}
          className="app-select-menu"
          role="listbox"
          aria-label={accessibleName}
        >
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            className="app-select-search"
            placeholder={searchPlaceholder}
            value={query}
            aria-label={searchPlaceholder}
            onChange={(e) => {
              const busca = e.target.value;
              setQuery(busca);
              setFocusedIndex(primeiroResultado(busca));
            }}
            // Delega ao mesmo handler do gatilho: as setas eram tratadas só no
            // botão, que perde o foco assim que o menu abre e o foco entra
            // aqui. Navegar por teclado era impossível.
            onKeyDown={handleKeyDown}
          />
          {filteredWithIndex.length === 0 ? (
            <div className="app-select-empty">Nenhum resultado</div>
          ) : (
            filteredWithIndex.map(({ opt, index }) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                disabled={opt.disabled}
                className={`app-select-option${index === focusedIndex ? ' is-focused' : ''}`}
                onMouseEnter={() => !opt.disabled && setFocusedIndex(index)}
                onClick={() => selectOption(opt)}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
