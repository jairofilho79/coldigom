import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SelectOption } from './selectTypes';

export type SelectProps = {
  id?: string;
  label?: string;
  'aria-label'?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
};

function getEnabledIndices(options: SelectOption[]): number[] {
  return options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
}

export function Select({
  id,
  label,
  'aria-label': ariaLabel,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className,
  compact = false,
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? '';
  const isPlaceholder = !value || !selected;
  const enabledIndices = getEnabledIndices(options);

  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  /**
   * Onde o destaque começa ao abrir: na opção atual, ou na primeira habilitada.
   *
   * Isto era um efeito com `enabledIndices` nas dependências — um array
   * recriado a cada render. O efeito rodava depois de TODO commit com o menu
   * aberto e devolvia o destaque para a opção já selecionada: as setas não
   * saíam do lugar e o realce do mouse piscava e voltava. Como a pergunta só
   * importa no instante da abertura, o lugar disso é o handler que abre.
   */
  const indiceInicial = (): number => {
    const selecionada = options.findIndex((o) => o.value === value && !o.disabled);
    return selecionada >= 0 ? selecionada : enabledIndices[0] ?? -1;
  };

  const abrir = () => {
    setFocusedIndex(indiceInicial());
    setOpen(true);
  };

  const selectIndex = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      close();
    },
    [options, onChange, close]
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
      if (focusedIndex >= 0) selectIndex(focusedIndex);
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
          {options.map((opt, index) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              disabled={opt.disabled}
              className={`app-select-option${index === focusedIndex ? ' is-focused' : ''}`}
              onMouseEnter={() => !opt.disabled && setFocusedIndex(index)}
              onClick={() => selectIndex(index)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
