import { useId, useRef } from 'react';

type StyledFileInputProps = {
  label: string;
  accept?: string;
  multiple?: boolean;
  /** Seleciona uma pasta inteira (Chromium); força `multiple`. */
  directory?: boolean;
  disabled?: boolean;
  /** Nome exibido quando há seleção (modo arquivo único). */
  selectedName?: string | null;
  onChange: (files: File[]) => void;
};

export function StyledFileInput({
  label,
  accept,
  multiple = false,
  directory = false,
  disabled = false,
  selectedName,
  onChange,
}: StyledFileInputProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName =
    selectedName ??
    (directory ? 'Nenhuma pasta selecionada' : 'Nenhum arquivo selecionado');

  return (
    <div className="styled-file-input">
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="styled-file-input-native"
        accept={accept}
        multiple={directory || multiple}
        disabled={disabled}
        onChange={(e) => {
          onChange(Array.from(e.target.files || []));
        }}
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - webkitdirectory is supported by Chromium browsers
        {...(directory ? { webkitdirectory: '' } : {})}
      />
      <label htmlFor={id} className="file-input-trigger">
        {label}
      </label>
      <span className="file-input-name">{displayName}</span>
    </div>
  );
}
