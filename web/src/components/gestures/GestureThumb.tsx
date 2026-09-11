import { resolver, type Indice } from '../../lib/gestures/dictionary';
import { getAssetUrl } from '../../services/api';

type Props = { id: string; indice: Indice | null; tamanho: 64 | 96 };

/**
 * Figura do gesto. Sem dicionário ou sem o id nele, o placeholder de gesto
 * ausente — é assim que o revisor descobre que o documento aponta para um gesto
 * que não existe, já que o PUT não confere isso de propósito.
 */
export function GestureThumb({ id, indice, tamanho }: Props) {
  const r = indice ? resolver(indice, id) : null;
  if (!r || !r.ok) {
    const motivo =
      !r ? 'Dicionário indisponível' : r.motivo === 'ausente' ? 'Gesto não encontrado no dicionário' : 'Cadeia de substituição inválida';
    return (
      <div
        className="gv-figura gv-figura--ausente"
        role="img"
        aria-label={motivo}
        title={`${motivo} (${id})`}
        style={{ width: tamanho, height: tamanho }}
      >
        ?
      </div>
    );
  }
  return (
    <img
      className={`gv-figura${r.viaAlias ? ' gv-figura--alias' : ''}`}
      // A chave (o nome do arquivo) não muda quando alguém troca a figura no
      // dicionário; sem uma versão na query o navegador continua servindo a
      // figura velha do cache. `indice.version` sobe a cada gravação do
      // dicionário — é o invalidador mais barato que já temos à mão.
      src={`${getAssetUrl(r.entrada.image)}?v=${indice!.version}`}
      alt={r.entrada.name}
      title={r.viaAlias ? `${r.entrada.name} (substituiu ${id})` : r.entrada.name}
      width={tamanho}
      height={tamanho}
      loading="lazy"
    />
  );
}
