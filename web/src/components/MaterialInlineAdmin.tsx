import { SearchableSelect } from './SearchableSelect';
import type { Material } from '../types';
import type { SelectOption } from './selectTypes';

type Props = {
  material: Material;
  options: SelectOption[];
  saving: boolean;
  onUpdateKind: (materialId: string, kind: string) => Promise<void>;
  onDelete: (materialId: string) => Promise<void>;
};

export function MaterialInlineAdmin({
  material,
  options,
  saving,
  onUpdateKind,
  onDelete,
}: Props) {
  return (
    <div className="material-inline-admin">
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
      <button
        type="button"
        className="auth-btn material-inline-admin-remove"
        disabled={saving}
        onClick={() => onDelete(material.id)}
      >
        Remover
      </button>
    </div>
  );
}
