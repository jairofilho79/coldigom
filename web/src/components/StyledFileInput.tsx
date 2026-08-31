import { useId } from 'react';

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

  const displayName =
    selectedName ??
    (directory ? 'Nenhuma pasta selecionada' : 'Nenhum arquivo selecionado');

  return (
    <div className="styled-file-input">
      <input
        id={id}
        type="file"
        className="styled-file-input-native"
        accept={accept}
        multiple={directory || multiple}
        disabled={disabled}
        onChange={(e) => {
          const input = e.target;
          onChange(Array.from(input.files || []));
          // O navegador não dispara `change` quando o value não muda: sem
          // limpar, reescolher o MESMO arquivo (ou a MESMA pasta, depois de
          // acrescentar algo nela) não avisava ninguém e a tela travava.
          input.value = '';
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
