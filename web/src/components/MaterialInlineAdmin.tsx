import { useState } from 'react';
import { SearchableSelect } from './SearchableSelect';
import { MoverMaterialForm } from './MoverMaterialForm';
import type { Material, PraiseDetail } from '../types';
import type { SelectOption } from './selectTypes';

type Props = {
  material: Material;
  options: SelectOption[];
  saving: boolean;
  onUpdateKind: (materialId: string, kind: string) => Promise<void>;
  onDelete: (materialId: string) => Promise<void>;
  /** Sem isto o botão "Mover" não aparece. */
  onMove?: (materialId: string, destino: PraiseDetail) => Promise<void>;
  buscarLouvor?: (id: string) => Promise<PraiseDetail>;
  selected?: boolean;
  onToggleSelect?: (selected: boolean) => void;
};

export function MaterialInlineAdmin({
  material,
  options,
  saving,
  onUpdateKind,
  onDelete,
  onMove,
  buscarLouvor,
  selected,
  onToggleSelect,
}: Props) {
  const [movendo, setMovendo] = useState(false);

  return (
    <div className="material-inline-admin">
      <div className="material-inline-admin-controls">
        {onToggleSelect ? (
          <label className="material-bulk-select-label" title="Selecionar material">
            <input
              type="checkbox"
              className="material-bulk-checkbox"
              checked={Boolean(selected)}
              disabled={saving}
              onChange={(e) => onToggleSelect(e.target.checked)}
              aria-label={`Selecionar ${material.material_kind_name || 'material'}`}
            />
          </label>
        ) : null}
        <SearchableSelect
          compact
          value={material.material_kind}
          disabled={saving}
          onChange={(material_kind) => onUpdateKind(material.id, material_kind)}
          options={options}
          aria-label="Categoria do material"
        />
        {material.merged_from_praise_id ? (
          <span className="merge-material-badge" title={material.merged_from_praise_id}>
            Mesclado{material.merged_from_praise_name ? `: ${material.merged_from_praise_name}` : ''}
          </span>
        ) : null}
        {onMove && !movendo ? (
          <button
            type="button"
            className="auth-btn material-inline-admin-remove"
            disabled={saving}
            onClick={() => setMovendo(true)}
          >
            Mover
          </button>
        ) : null}
        <button
          type="button"
          className="auth-btn material-inline-admin-remove"
          disabled={saving}
          onClick={() => onDelete(material.id)}
        >
          Remover
        </button>
      </div>
      {onMove && movendo ? (
        <MoverMaterialForm
          praiseAtualId={material.praise_id}
          busy={saving}
          buscarLouvor={buscarLouvor}
          onCancel={() => setMovendo(false)}
          onConfirm={async (destino) => {
            await onMove(material.id, destino);
            setMovendo(false);
          }}
        />
      ) : null}
    </div>
  );
}
