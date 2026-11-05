import { useState, useEffect, useRef } from 'react';

type Props = {
  value: string | null | undefined;
  onSave: (notes: string | null) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function MaterialNotesInput({
  value,
  onSave,
  disabled,
  placeholder = 'Nota/Voz, ex: I, II, Cifrado',
  className,
}: Props) {
  const [text, setText] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const isCancelledRef = useRef(false);

  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  const commit = async () => {
    if (isCancelledRef.current) {
      isCancelledRef.current = false;
      return;
    }
    const trimmed = text.trim();
    const current = (value ?? '').trim();
    if (trimmed === current) {
      if (text !== (value ?? '')) {
        setText(value ?? '');
      }
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed.length > 0 ? trimmed : null);
    } catch {
      setText(value ?? '');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      isCancelledRef.current = true;
      setText(value ?? '');
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'Enter') {
      // Previne submissão precoce durante composição IME
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      className={`material-notes-input${className ? ` ${className}` : ''}`}
      value={text}
      disabled={disabled || saving}
      placeholder={placeholder}
      title={placeholder}
      aria-label={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={handleKeyDown}
    />
  );
}
