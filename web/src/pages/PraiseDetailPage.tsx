import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getPraise, getAssetUrl, getPraiseDownloadZipUrl, createPraise, updatePraise, groupPraise, getMaterialKinds, getTags, createTag, addPraiseTag, removePraiseTag, createMaterial, updateMaterial, deleteMaterial, bulkUploadMaterials, getDriveStatus, getDriveConnectUrl, startDriveScan, startDriveImport, getImportJob, retryFailedImportItems, type ImportJobSummary } from '../services/api';
import { AuthControl } from '../components/AuthControl';
import { AudioPlayer } from '../components/AudioPlayer';
import { MaterialInlineAdmin } from '../components/MaterialInlineAdmin';
import { StyledFileInput } from '../components/StyledFileInput';
import { INITIAL_BULK_SCAN, type BulkScanState } from '../components/bulkScanState';
import { Select } from '../components/Select';
import { PainelImportacaoDrive } from '../components/PainelImportacaoDrive';
import { PainelPastaLocal } from '../components/PainelPastaLocal';
import { StatusImportacaoDrive } from '../components/StatusImportacaoDrive';
import { SearchableSelect } from '../components/SearchableSelect';
import { groupMaterialsByType, materialDisplayName } from '../lib/materials';
import {
  folderNameFromFiles,
  scanFolderFilesAsync,
  mapDriveFilesAsync,
  type BulkFileItem,
} from '../lib/materialKindInference/scanFolder';
import type { PraiseDetail, Tag, MaterialKind } from '../types';
import { problemaDoArquivo } from '../lib/uploadLimits';

function tagLabel(tag: Tag, catalog?: Tag[]): string {
  if (tag.parent_name) return `${tag.parent_name} · ${tag.name}`;
  if (tag.parent_id && catalog) {
    const parent = catalog.find((t) => t.id === tag.parent_id);
    if (parent) return `${parent.name} · ${tag.name}`;
  }
  return tag.name;
}

/** Tipos que ganham seção desenhada sob medida na tela. */
const TIPOS_COM_SECAO_PROPRIA = new Set(['youtube', 'mp3', 'pdf', 'chord']);

const MATERIAL_TYPE_OPTIONS = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'pdf', label: 'PDF' },
  { value: 'mp3', label: 'MP3' },
  { value: 'chord', label: 'Cifra' },
] as const;

type MaterialFormType = 'youtube' | 'pdf' | 'mp3' | 'chord';

type NewMaterialForm = {
  material_kind: string;
  type: MaterialFormType;
  url: string;
  file: File | null;
};

const DEFAULT_NEW_MAT: NewMaterialForm = {
  material_kind: '',
  type: 'pdf',
  url: '',
  file: null,
};

function preserveScroll(el: HTMLElement | null | undefined, run: () => void) {
  const before = el?.getBoundingClientRect().top;
  const y = window.scrollY;
  run();
  // ponytail: double rAF waits for React commit + layout
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (el && before != null) {
        window.scrollBy(0, el.getBoundingClientRect().top - before);
      } else {
        window.scrollTo({ top: y });
      }
    });
  });
}

/** Os campos editáveis, lidos do louvor. Semeia a cópia de edição. */
function camposDe(p: PraiseDetail) {
  return {
    name: p.name || '',
    number: p.number || '',
    author: p.author || '',
    rhythm: p.rhythm || '',
    tonality: p.tonality || '',
    category: p.category || '',
    lyrics: p.lyrics || '',
  };
}

const CHAVE_RASCUNHO = 'coldigom_rascunho_louvor';

type Rascunho = {
  rota: string;
  edit: ReturnType<typeof camposDe>;
  pendingTagIds: string[];
  driveUrl: string;
};

/**
 * Autorizar o Drive é navegação de página inteira: o componente remonta do zero
 * na volta, e tudo que estava digitado — nome, número, autor, ritmo, tom,
 * categoria, letra, tags escolhidas e o próprio link colado — voltava em branco.
 *
 * Acesso tolerante ao armazenamento: bloqueado, degrada em vez de derrubar a
 * árvore inteira (mesma lição do S5). Arquivos locais não são recuperáveis por
 * este caminho; a pasta precisa ser escolhida de novo, e a tela avisa.
 */
function salvarRascunho(r: Rascunho): void {
  try {
    sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(r));
  } catch {
    /* sem rascunho, o comportamento é o de antes */
  }
}

function consumirRascunho(rota: string): Rascunho | null {
  try {
    const cru = sessionStorage.getItem(CHAVE_RASCUNHO);
    if (!cru) return null;
    sessionStorage.removeItem(CHAVE_RASCUNHO);
    const r = JSON.parse(cru) as Rascunho;
    return r?.rota === rota ? r : null;
  } catch {
    return null;
  }
}


function canSubmitNewMaterial(mat: NewMaterialForm): boolean {
  if (!mat.material_kind) return false;
  if (mat.type === 'youtube') return mat.url.trim().length > 0;
  if (mat.type === 'pdf' || mat.type === 'mp3') return mat.file !== null;
  return false;
}


export function PraiseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isCreate = id === 'new';
  const { user, ready: authReady } = useAuth();
  const userName = authReady ? (user?.name || user?.email || null) : null;
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(isCreate);
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [savingMetadata, setSavingMetadata] = useState(false);
  // Criar é uma sequência de três passos com efeito no servidor: cria o louvor,
  // sobe os arquivos, dispara o import do Drive. Falhando qualquer passo depois do
  // primeiro, o louvor já existe — guardamos qual para que uma nova tentativa
  // retome de onde parou em vez de criar um louvor duplicado e vazio no acervo.
  const [louvorCriado, setLouvorCriado] = useState<PraiseDetail | null>(null);
  const [savingLyrics, setSavingLyrics] = useState(false);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>([]);
  const [categoriasErro, setCategoriasErro] = useState<string | null>(null);
  const [newMat, setNewMat] = useState<NewMaterialForm>({ ...DEFAULT_NEW_MAT });
  const [bulkFiles, setBulkFiles] = useState<BulkFileItem[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkScan, setBulkScan] = useState<BulkScanState>(INITIAL_BULK_SCAN);
  const bulkScanAbortRef = useRef<AbortController | null>(null);
  const pendingFolderFilesRef = useRef<File[] | null>(null);
  const lastFolderFilesRef = useRef<File[]>([]);
  const folderInputRetryRef = useRef<(() => void) | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [driveFiles, setDriveFiles] = useState<BulkFileItem[]>([]);
  const [driveScan, setDriveScan] = useState<BulkScanState>(INITIAL_BULK_SCAN);
  const [driveSkipped, setDriveSkipped] = useState<Array<{ path: string; reason: string }>>([]);
  const [driveImportJob, setDriveImportJob] = useState<ImportJobSummary | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveJobErro, setDriveJobErro] = useState<string | null>(null);
  const [mergeAviso, setMergeAviso] = useState<string | null>(null);
  const [rascunhoAviso, setRascunhoAviso] = useState<string | null>(null);
  const driveScanAbortRef = useRef<AbortController | null>(null);
  const drivePanelRef = useRef<HTMLDivElement | null>(null);
  const [catalogTags, setCatalogTags] = useState<Tag[]>([]);
  const [tagToAdd, setTagToAdd] = useState('');
  const [tagsBusy, setTagsBusy] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const copiaTimeoutRef = useRef<number | null>(null);
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [groupTargetId, setGroupTargetId] = useState('');
  const [groupingBusy, setGroupingBusy] = useState(false);
  const [edit, setEdit] = useState({
    name: '',
    number: '',
    author: '',
    rhythm: '',
    tonality: '',
    category: '',
    lyrics: '',
  });
  const [newSubtagParentId, setNewSubtagParentId] = useState('');
  const [newSubtagName, setNewSubtagName] = useState('');
  const [subtagBusy, setSubtagBusy] = useState(false);
  // "Criar e associar" são duas escritas: cria a tag no catálogo, depois liga ao
  // louvor. Falhando a segunda, a tag já existe — e sem guardar qual, a tentativa
  // seguinte criava outra de mesmo nome sob o mesmo pai. O catálogo é compartilhado,
  // então as duas ficavam indistinguíveis no dropdown de todo mundo.
  const [subtagCriada, setSubtagCriada] = useState<Tag | null>(null);

  // Toda mutação (tag, material, metadados, letra, agrupamento) devolve o louvor
  // inteiro, e cada uma chamava setPraise cru. As flags de "ocupado" são separadas,
  // então duas escritas podiam estar em voo ao mesmo tempo — e vencia a que chegasse
  // por último, ainda que fosse a mais antiga: um material apagado no servidor
  // reaparecia na tela, e o clique seguinte nele dava "Material not found".
  const seqEscritaRef = useRef(0);

  /**
   * Executa uma escrita e só aplica a resposta se nenhuma outra escrita tiver
   * começado depois dela. Erros continuam subindo para quem chamou.
   */
  const executarEscrita = useCallback(
    async (operacao: () => Promise<PraiseDetail>): Promise<void> => {
      const seq = ++seqEscritaRef.current;
      const atualizado = await operacao();
      if (seq !== seqEscritaRef.current) return;
      setPraise(atualizado);
    },
    []
  );

  /** Para escritas cuja resposta já veio por outro caminho: marca como a mais nova. */
  const aplicarEscrita = useCallback((atualizado: PraiseDetail) => {
    seqEscritaRef.current += 1;
    setPraise(atualizado);
  }, []);

  useEffect(() => {
    const fetchPraise = async () => {
      if (!id || id === 'new') return;
      setLoading(true);
      setError(null);
      try {
        const data = await getPraise(id);
        if (!data) {
          setPraise(null);
          return;
        }
        setPraise(data);
        setEdit(camposDe(data));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load praise');
      } finally {
        setLoading(false);
      }
    };

    fetchPraise();
  }, [id]);

  useEffect(() => {
    if (!userName) return;
    const fetchTagCatalog = async () => {
      try {
        const tags = await getTags();
        setCatalogTags(tags);
      } catch {
        // ignore
      }
    };
    void fetchTagCatalog();
  }, [userName]);

  /**
   * Sem catálogo, o seletor de categoria fica sem opção, `canSubmitNewMaterial`
   * nunca devolve true e o botão de adicionar material fica desabilitado para
   * sempre. O catch era vazio: nada disso tinha explicação na tela.
   */
  const carregarCategorias = useCallback(async () => {
    setCategoriasErro(null);
    try {
      const kinds = await getMaterialKinds();
      setMaterialKinds(kinds);
      if (kinds.length > 0) {
        setNewMat((s) => (s.material_kind ? s : { ...s, material_kind: kinds[0].id }));
      }
    } catch {
      setCategoriasErro('Não foi possível carregar as categorias de material.');
    }
  }, []);

  useEffect(() => {
    void carregarCategorias();
  }, [carregarCategorias]);

  const materialKindOptions = useMemo(
    () => materialKinds.map((k) => ({ value: k.id, label: k.name })),
    [materialKinds]
  );

  const handleBulkKindChange = useCallback((index: number, material_kind: string) => {
    setBulkFiles((list) => list.map((x, i) => (i === index ? { ...x, material_kind } : x)));
  }, []);

  const handleBulkRemove = useCallback((index: number) => {
    setBulkFiles((list) => list.filter((_, i) => i !== index));
  }, []);

  const handleDriveKindChange = useCallback((index: number, material_kind: string) => {
    setDriveFiles((list) => list.map((x, i) => (i === index ? { ...x, material_kind } : x)));
  }, []);

  const handleDriveRemove = useCallback((index: number) => {
    setDriveFiles((list) => list.filter((_, i) => i !== index));
  }, []);

  useEffect(() => {
    if (!userName) return;
    void getDriveStatus()
      .then((s) => setDriveConnected(s.connected))
      .catch(() => setDriveConnected(false));
  }, [userName]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const auth = params.get('auth');
    if (!auth) return;

    if (auth === 'drive_connected') {
      setDriveConnected(true);
      setError(null);
    } else if (auth === 'drive_error') {
      setError('Não foi possível conectar o Google Drive. Tente novamente.');
    }

    const rascunho = consumirRascunho(location.pathname);
    if (rascunho) {
      setEdit(rascunho.edit);
      setPendingTagIds(rascunho.pendingTagIds);
      setDriveUrl(rascunho.driveUrl);
      setIsEditing(true);
      setRascunhoAviso(
        'Recuperamos o que você tinha preenchido. Os arquivos da pasta local precisam ser escolhidos de novo.'
      );
    }

    // O parâmetro sai da URL: sem isso, um F5 reafirmava a conexão do Drive
    // (mesmo se ela tivesse sido revogada) ou refixava o erro para sempre.
    params.delete('auth');
    const busca = params.toString();
    navigate(`${location.pathname}${busca ? `?${busca}` : ''}`, { replace: true });
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    const state = location.state as {
      driveImportJobId?: string;
      mergeSuccess?: boolean;
      mergedPraiseName?: string;
    } | null;
    if (!state) return;

    if (state.mergeSuccess) {
      setMergeAviso(
        state.mergedPraiseName
          ? `Mesclagem concluída — «${state.mergedPraiseName}» foi importado e excluído.`
          : 'Mesclagem concluída.'
      );
    }
    if (state.driveImportJobId && !isCreate) {
      void getImportJob(state.driveImportJobId)
        .then((job) => setDriveImportJob(job))
        .catch(() => setDriveJobErro('Não foi possível acompanhar esta importação.'));
    }

    // Consumido: sem limpar, o aviso e o painel do job antigo voltavam num F5 ou
    // no botão Voltar do navegador, porque o react-router preserva history.state.
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, isCreate, navigate]);

  useEffect(() => {
    if (!driveImportJob?.id || driveJobErro) return;
    // O motivo de cada falha agora aparece na própria linha do item, então este
    // efeito não precisa mais ler `items` — que vinha como array novo a cada
    // resposta e, estando nas dependências, destruía e recriava o intervalo a
    // cada consulta.
    if (['done', 'completed_with_errors', 'failed'].includes(driveImportJob.status)) return;
    const t = window.setInterval(() => {
      void getImportJob(driveImportJob.id)
        .then(async (job) => {
          setDriveImportJob(job);
          if (['done', 'completed_with_errors', 'failed'].includes(job.status) && id && id !== 'new') {
            try {
              const seq = seqEscritaRef.current;
              const refreshed = await getPraise(id);
              // Se uma escrita começou enquanto a releitura viajava, ela é mais nova.
              if (seq !== seqEscritaRef.current) return;
              preserveScroll(drivePanelRef.current, () => setPraise(refreshed));
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {
          // Engolir o erro deixava o intervalo rodando para sempre — o job podia
          // ter sumido (louvor apagado leva o job pela cascata, ou é de outra
          // sessão) e a tela ficava em "Na fila" eternamente, consultando a API
          // a cada 1,5 s até o usuário sair da página.
          setDriveJobErro(
            'Não foi possível acompanhar esta importação. Ela pode ter terminado; recarregue a página.'
          );
        });
    }, 1500);
    return () => window.clearInterval(t);
  }, [driveImportJob?.id, driveImportJob?.status, driveJobErro, id]);

  // Ref, não dependência: o rascunho muda a cada tecla, e pô-lo nas dependências
  // recriaria o callback do scan em todo render.
  const rascunhoRef = useRef<Rascunho | null>(null);
  rascunhoRef.current = {
    rota: location.pathname,
    edit,
    pendingTagIds,
    driveUrl,
  };

  const irAutorizarDrive = useCallback(() => {
    if (rascunhoRef.current) salvarRascunho(rascunhoRef.current);
    window.location.href = getDriveConnectUrl(window.location.href);
  }, []);

  const runDriveScan = useCallback(async () => {
    const url = driveUrl.trim();
    if (!url) {
      setError('Cole um link do Google Drive');
      return;
    }
    setError(null);
    setDriveSkipped([]);
    setDriveImportJob(null);
    driveScanAbortRef.current?.abort();
    const ac = new AbortController();
    driveScanAbortRef.current = ac;
    setDriveBusy(true);
    setDriveFiles([]);
    setDriveScan({
      phase: 'scanning',
      processed: 0,
      total: 0,
      folderName: 'Google Drive',
      error: null,
    });
    try {
      if (driveConnected === false) {
        irAutorizarDrive();
        return;
      }
      const scan = await startDriveScan(url);
      if (ac.signal.aborted) return;
      setDriveSkipped(scan.skipped || []);
      const mapped = await mapDriveFilesAsync(
        scan.files,
        materialKinds,
        (processed, total) => setDriveScan((s) => ({ ...s, processed, total, phase: 'scanning' })),
        ac.signal
      );
      setDriveFiles(mapped);
      setDriveConnected(true);
      setDriveScan({
        phase: 'done',
        processed: mapped.length,
        total: mapped.length,
        folderName: 'Google Drive',
        error: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Falha ao ler o Google Drive';
      if (/not connected/i.test(message) || /drive_not_connected/i.test(message)) {
        setDriveConnected(false);
        irAutorizarDrive();
        return;
      }
      setDriveScan({
        phase: 'error',
        processed: 0,
        total: 0,
        folderName: 'Google Drive',
        error: message,
      });
      setError(message);
    } finally {
      setDriveBusy(false);
    }
  }, [driveUrl, driveConnected, materialKinds, irAutorizarDrive]);

  const runFolderScan = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      setBulkFiles([]);
      setBulkScan(INITIAL_BULK_SCAN);
      lastFolderFilesRef.current = [];
      return;
    }

    lastFolderFilesRef.current = files;
    const folderName = folderNameFromFiles(files);

    if (materialKinds.length === 0) {
      pendingFolderFilesRef.current = files;
      setBulkFiles([]);
      setBulkScan({
        phase: 'error',
        processed: 0,
        total: files.length,
        folderName,
        error: categoriasErro
          ? `${categoriasErro} Sem elas não dá para classificar os arquivos.`
          : 'Catálogo de categorias ainda carregando. Aguarde um instante e clique em “Tentar novamente”.',
      });
      return;
    }

    pendingFolderFilesRef.current = null;
    bulkScanAbortRef.current?.abort();
    const ac = new AbortController();
    bulkScanAbortRef.current = ac;

    setBulkFiles([]);
    setBulkScan({
      phase: 'scanning',
      processed: 0,
      total: files.length,
      folderName,
      error: null,
    });

    try {
      const mapped = await scanFolderFilesAsync(
        files,
        materialKinds,
        (processed, total) => {
          setBulkScan((s) => ({ ...s, processed, total }));
        },
        ac.signal
      );
      setBulkFiles(mapped);
      setBulkScan({
        phase: 'done',
        processed: mapped.length,
        total: mapped.length,
        folderName,
        error: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setBulkScan({
        phase: 'error',
        processed: 0,
        total: files.length,
        folderName,
        error: err instanceof Error ? err.message : 'Falha ao analisar a pasta',
      });
    }
  }, [materialKinds, categoriasErro]);

  useEffect(() => {
    folderInputRetryRef.current = () => {
      const files = pendingFolderFilesRef.current ?? lastFolderFilesRef.current;
      if (files.length) void runFolderScan(files);
    };
  }, [runFolderScan]);

  useEffect(() => {
    const pending = pendingFolderFilesRef.current;
    if (pending?.length && materialKinds.length > 0) {
      void runFolderScan(pending);
    }
  }, [materialKinds, runFolderScan]);

  useEffect(() => {
    return () => {
      bulkScanAbortRef.current?.abort();
      // O scan do Drive também fica em voo; só o local era abortado.
      driveScanAbortRef.current?.abort();
      if (copiaTimeoutRef.current) window.clearTimeout(copiaTimeoutRef.current);
    };
  }, []);
  const assignedTagIds = useMemo(
    () => (isCreate ? new Set(pendingTagIds) : new Set((praise?.tags || []).map((t) => t.id))),
    [isCreate, pendingTagIds, praise?.tags]
  );
  const displayTags = useMemo(() => {
    if (!isCreate) return praise?.tags || [];
    return catalogTags.filter((t) => pendingTagIds.includes(t.id));
  }, [isCreate, praise?.tags, catalogTags, pendingTagIds]);
  const availableTags = useMemo(() => {
    const childParentIds = new Set(
      catalogTags.filter((t) => t.parent_id).map((t) => t.parent_id as string)
    );
    return catalogTags.filter((t) => !assignedTagIds.has(t.id) && !childParentIds.has(t.id));
  }, [catalogTags, assignedTagIds]);
  const rootTags = useMemo(
    () => catalogTags.filter((t) => !t.parent_id),
    [catalogTags]
  );
  const tagSelectOptions = useMemo(
    () => availableTags.map((t) => ({ value: t.id, label: tagLabel(t, catalogTags) })),
    [availableTags, catalogTags]
  );
  const rootSelectOptions = useMemo(
    () => rootTags.map((t) => ({ value: t.id, label: t.name })),
    [rootTags]
  );
  const materialGroups = useMemo(
    () => groupMaterialsByType(praise?.materials ?? []),
    [praise?.materials]
  );
  const youtubeMaterials = useMemo(
    () => (materialGroups.find((g) => g.type === 'youtube')?.items ?? []).filter((m) => m.url),
    [materialGroups]
  );
  const audioMaterials = materialGroups.find((g) => g.type === 'mp3')?.items ?? [];
  const pdfMaterials = materialGroups.find((g) => g.type === 'pdf')?.items ?? [];
  const chordMaterials = materialGroups.find((g) => g.type === 'chord')?.items ?? [];
  // Todo o resto. Sem esta lista, material que a API aceitou (mid, gestures, txt,
  // e qualquer extensão que a importação em lote infira) ficava invisível: gravado
  // no banco e no R2, presente no ZIP, e sem nenhum caminho na tela para ser visto,
  // recategorizado ou apagado — o usuário reimportava achando que tinha falhado.
  const outrosGrupos = materialGroups.filter((g) => !TIPOS_COM_SECAO_PROPRIA.has(g.type));
  const canEditMaterialsInline = Boolean(userName && isEditing && !isCreate);
  // Um único arquivo recusado derruba o lote inteiro no servidor. Barrar aqui evita
  // a subida completa seguida de recusa, que era o que acontecia.
  const bulkTemProblema = bulkFiles.some((f) => problemaDoArquivo(f) !== null);
  const driveTemProblema = driveFiles.some((f) => problemaDoArquivo(f) !== null);

  const handleMaterialKindChange = async (materialId: string, material_kind: string) => {
    setSavingMaterials(true);
    setError(null);
    try {
      await executarEscrita(() => updateMaterial(materialId, { material_kind }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar material');
    } finally {
      setSavingMaterials(false);
    }
  };

  const handleMaterialDelete = async (materialId: string) => {
    // Um clique apagava o material e o arquivo no R2, sem volta. Mesma confirmação
    // que a tela de mesclagem usa antes de excluir do louvor que sobrevive.
    const alvo = praise?.materials.find((m) => m.id === materialId);
    const nome = alvo ? materialDisplayName(alvo) : 'este material';
    if (
      !window.confirm(
        `«${nome}» será excluído permanentemente, junto com o arquivo guardado. Continuar?`
      )
    ) {
      return;
    }
    setSavingMaterials(true);
    setError(null);
    try {
      await executarEscrita(() => deleteMaterial(materialId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover material');
    } finally {
      setSavingMaterials(false);
    }
  };

  const materialAdminProps = canEditMaterialsInline
    ? {
        materialKindOptions,
        saving: savingMaterials,
        onUpdateKind: handleMaterialKindChange,
        onDelete: handleMaterialDelete,
      }
    : undefined;

  if (!isCreate && loading) {
    return (
      <main className="page-container detail-page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <div className="loading-text">Carregando louvor...</div>
        </div>
      </main>
    );
  }

  if (!isCreate && error && !praise) {
    return (
      <main className="page-container detail-page">
        <div className="error-state">
          <div className="error-state-icon">⚠</div>
          <div className="error-state-title">Erro ao carregar</div>
          <div className="error-state-desc">{error}</div>
        </div>
      </main>
    );
  }

  if (!isCreate && !praise) {
    return (
      <main className="page-container detail-page">
        <div className="no-results">
          <div className="no-results-icon">📖</div>
          <div className="no-results-title">Louvor não encontrado</div>
        </div>
      </main>
    );
  }

  const parseYouTubeId = (url: string): string | null => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (host === 'youtu.be') {
        const id = u.pathname.split('/').filter(Boolean)[0];
        return id || null;
      }
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const v = u.searchParams.get('v');
        if (v) return v;
        const parts = u.pathname.split('/').filter(Boolean);
        const idxEmbed = parts.indexOf('embed');
        if (idxEmbed >= 0 && parts[idxEmbed + 1]) return parts[idxEmbed + 1];
        const idxShorts = parts.indexOf('shorts');
        if (idxShorts >= 0 && parts[idxShorts + 1]) return parts[idxShorts + 1];
      }
      return null;
    } catch {
      return null;
    }
  };

  const saveMetadata = async () => {
    setSavingMetadata(true);
    setError(null);
    // Lido de forma síncrona: o `setLouvorCriado` logo abaixo só chega ao estado no
    // render seguinte, e o `catch` desta mesma execução precisa da resposta agora.
    let louvorNoServidor = Boolean(louvorCriado);
    try {
      if (!edit.name.trim()) {
        setError('Nome é obrigatório');
        return;
      }
      if (isCreate) {
        if (bulkFiles.some((f) => !f.material_kind) || driveFiles.some((f) => !f.material_kind)) {
          setError('Defina a categoria de todos os arquivos antes de criar');
          return;
        }
        let created = louvorCriado;
        if (!created) {
          created = await createPraise({
            name: edit.name.trim(),
            number: edit.number || null,
            author: edit.author || null,
            rhythm: edit.rhythm || null,
            tonality: edit.tonality || null,
            category: edit.category || null,
            lyrics: edit.lyrics || null,
            tag_ids: pendingTagIds,
          });
          setLouvorCriado(created);
          louvorNoServidor = true;
        }
        if (bulkFiles.length > 0) {
          created = await bulkUploadMaterials(
            created.id,
            bulkFiles
              .filter((f): f is BulkFileItem & { file: File } => Boolean(f.file))
              .map((f) => ({
                file: f.file,
                material_kind: f.material_kind,
                type: f.type,
                file_path_legacy: f.relPath,
              }))
          );
        }
        let driveImportJobId: string | undefined;
        const driveItems = driveFiles.filter((f) => f.driveFileId);
        if (driveItems.length > 0) {
          const started = await startDriveImport(
            created.id,
            driveItems.map((f) => ({
              drive_file_id: f.driveFileId!,
              material_kind: f.material_kind,
              type: f.type,
              file_path_legacy: f.relPath,
            }))
          );
          driveImportJobId = started.id;
          setDriveImportJob(started);
        }
        navigate(`/praise/${created.id}`, {
          replace: true,
          state: driveImportJobId ? { driveImportJobId } : undefined,
        });
        setPraise(created);
        setIsEditing(false);
        setBulkFiles([]);
        setBulkScan(INITIAL_BULK_SCAN);
        setDriveFiles([]);
        setDriveScan(INITIAL_BULK_SCAN);
        setPendingTagIds([]);
        setLouvorCriado(null);
      } else if (id) {
        await executarEscrita(() =>
          updatePraise(
            id,
            {
              name: edit.name,
              number: edit.number,
              author: edit.author,
              rhythm: edit.rhythm,
              tonality: edit.tonality,
              category: edit.category,
            },
            praise?.updated_at
          )
        );
      }
    } catch (err) {
      const motivo = err instanceof Error ? err.message : 'Falha ao salvar metadados';
      // Sem esta distinção o usuário lia só o erro do envio e concluía que nada
      // tinha acontecido — quando na verdade o louvor já estava no acervo.
      setError(
        isCreate && louvorNoServidor
          ? `${motivo} — o louvor já foi criado; tentar de novo só reenvia os arquivos.`
          : motivo
      );
    } finally {
      setSavingMetadata(false);
    }
  };

  const criarEAssociarSubtag = async () => {
    if (!newSubtagParentId || !newSubtagName.trim()) return;
    setSubtagBusy(true);
    setError(null);
    let tag = subtagCriada;
    try {
      if (!tag) {
        tag = await createTag({
          name: newSubtagName.trim(),
          parent_id: newSubtagParentId,
        });
        setSubtagCriada(tag);
        setCatalogTags((prev) => [...prev, tag as Tag]);
      }
      if (isCreate) {
        const criada = tag;
        setPendingTagIds((ids) => (ids.includes(criada.id) ? ids : [...ids, criada.id]));
      } else if (id) {
        await executarEscrita(() => addPraiseTag(id, (tag as Tag).id));
      }
      setNewSubtagName('');
      setNewSubtagParentId('');
      setSubtagCriada(null);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : 'Falha ao criar subtag';
      // Sem distinguir os passos, a mensagem culpava a criação por um erro que era
      // da associação, e o usuário reagia recriando a tag.
      setError(tag ? `${motivo} — a subtag já foi criada; falta associá-la.` : motivo);
    } finally {
      setSubtagBusy(false);
    }
  };

  const tentarImportacoesQueFalharam = async () => {
    if (!driveImportJob) return;
    setDriveBusy(true);
    try {
      await retryFailedImportItems(driveImportJob.id);
      const job = await getImportJob(driveImportJob.id);
      preserveScroll(drivePanelRef.current, () => setDriveImportJob(job));
    } catch (err) {
      console.error('[Drive import] retry failed', err);
      setError('Não foi possível tentar de novo. Contate o suporte se o problema continuar.');
    } finally {
      setDriveBusy(false);
    }
  };

  const alternarEdicao = () => {
    setIsEditing((editando) => {
      // Reabrir tem que mostrar o que está gravado. Antes, `edit` era semeado uma
      // única vez no fetch: o valor abandonado ao fechar continuava lá, invisível, e
      // ia junto no próximo Salvar de qualquer outro campo.
      if (!editando && praise) setEdit(camposDe(praise));
      return !editando;
    });
  };

  const saveLyrics = async () => {
    if (!id || isCreate) return;
    setSavingLyrics(true);
    setError(null);
    try {
      await executarEscrita(() => updatePraise(id, { lyrics: edit.lyrics }, praise?.updated_at));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar letra');
    } finally {
      setSavingLyrics(false);
    }
  };

  return (
    <main className="page-container detail-page">
      <Link to="/" className="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Voltar para lista
      </Link>

      {error ? (
        <div className="error-state" style={{ marginBottom: '1rem' }}>
          <div className="error-state-desc">{error}</div>
        </div>
      ) : null}

      {mergeAviso ? (
        <div className="detail-aviso" role="status">
          {mergeAviso}
        </div>
      ) : null}

      {rascunhoAviso ? (
        <div className="detail-aviso" role="status">
          {rascunhoAviso}
        </div>
      ) : null}

      {categoriasErro && userName ? (
        <div className="error-state" style={{ marginBottom: '1rem' }} role="status">
          <div className="error-state-desc">{categoriasErro}</div>
          <button
            type="button"
            className="auth-btn"
            onClick={() => void carregarCategorias()}
          >
            Tentar carregar de novo
          </button>
        </div>
      ) : null}

      <header className="detail-header animate-fade-in-scale">
        <div className="auth-row">
          {!authReady ? (
            <div className="auth-user muted">Verificando sessão…</div>
          ) : userName ? (
            // Controle de sessão extraído para AuthControl; os botões de ação da página
            // (Editar/Baixar em ZIP/Mesclar/Cancelar) não são parte dele e viajam como children,
            // preservando a posição visual entre o nome e o "Sair". avatarSize preserva o
            // tamanho original do avatar aqui (28px); onAfterLogout fecha o modo de edição
            // ao sair, como o botão "Sair" original fazia.
            <AuthControl
              avatarSize={28}
              onAfterLogout={() => setIsEditing(false)}
              prefixo="Logado como"
            >
              {isCreate ? (
                <Link to="/" className="auth-btn">
                  Cancelar
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    className="auth-btn"
                    onClick={alternarEdicao}
                  >
                    {isEditing ? 'Fechar edição' : 'Editar'}
                  </button>
                  <a
                    className="auth-btn"
                    href={getPraiseDownloadZipUrl(id!)}
                    download
                  >
                    Baixar em ZIP
                  </a>
                  <Link to={`/praise/${id}/merge`} className="auth-btn">
                    Mesclar
                  </Link>
                </>
              )}
            </AuthControl>
          ) : (
            <>
              {/* Baixar em ZIP fica ao lado do controle de sessão, mas não é parte dele. */}
              {!isCreate && id ? (
                <a
                  className="auth-btn"
                  href={getPraiseDownloadZipUrl(id)}
                  download
                >
                  Baixar em ZIP
                </a>
              ) : null}
              <AuthControl />
            </>
          )}
        </div>

        {isCreate && !userName && authReady ? (
          <p className="muted">Entre com o Google para cadastrar um novo louvor.</p>
        ) : null}

        {isCreate && userName ? (
          <h1 className="detail-title">Novo louvor</h1>
        ) : null}

        {isEditing && (userName || !isCreate) ? (
          <div className="edit-grid">
            <label className="edit-field">
              <span className="edit-field-label">Nome</span>
              <input value={edit.name} onChange={(e) => setEdit(s => ({ ...s, name: e.target.value }))} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Número</span>
              <input value={edit.number} onChange={(e) => setEdit(s => ({ ...s, number: e.target.value }))} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Autor</span>
              <input value={edit.author} onChange={(e) => setEdit(s => ({ ...s, author: e.target.value }))} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Ritmo</span>
              <input value={edit.rhythm} onChange={(e) => setEdit(s => ({ ...s, rhythm: e.target.value }))} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Tom</span>
              <input value={edit.tonality} onChange={(e) => setEdit(s => ({ ...s, tonality: e.target.value }))} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Categoria</span>
              <input value={edit.category} onChange={(e) => setEdit(s => ({ ...s, category: e.target.value }))} />
            </label>

            {!isCreate ? (
              <div className="edit-actions">
                <button
                  type="button"
                  className="auth-btn"
                  disabled={savingMetadata}
                  onClick={() => void saveMetadata()}
                >
                  {savingMetadata ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            ) : null}
          </div>
        ) : praise ? (
          <>
            {praise.number && (
              <div className="detail-number">Nº {praise.number}</div>
            )}
            <h1 className="detail-title">{praise.name}</h1>
          </>
        ) : null}

        {isEditing && (userName || !isCreate) ? (
          <hr className="detail-section-divider" />
        ) : null}

        {!isEditing && praise && (
          <div className="detail-meta-row">
            <div className="detail-meta-item detail-meta-item--id">
              <span className="label">ID</span>
              <span className="value detail-id-value">{praise.id}</span>
              <button
                type="button"
                className="detail-copy-id-btn"
                aria-label="Copiar ID"
                onClick={() => void (async () => {
                  try {
                    await navigator.clipboard.writeText(praise.id);
                    setIdCopied(true);
                    if (copiaTimeoutRef.current) window.clearTimeout(copiaTimeoutRef.current);
                    copiaTimeoutRef.current = window.setTimeout(() => setIdCopied(false), 2000);
                  } catch {
                    setError('Não foi possível copiar o ID');
                  }
                })()}
              >
                {idCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            {praise.author && (
            <div className="detail-meta-item">
              <span className="label">Autor</span>
              <span className="value">{praise.author}</span>
            </div>
            )}
            {praise.rhythm && (
            <div className="detail-meta-item">
              <span className="label">Ritmo</span>
              <span className="value">{praise.rhythm}</span>
            </div>
            )}
            {praise.tonality && (
            <div className="detail-meta-item">
              <span className="label">Tom</span>
              <span className="value">{praise.tonality}</span>
            </div>
            )}
            {praise.category && (
            <div className="detail-meta-item">
              <span className="label">Categoria</span>
              <span className="value">{praise.category}</span>
            </div>
            )}
          </div>
        )}

        {isEditing && userName ? (
          <div className="detail-tags detail-tags--edit">
            <span className="detail-tags-label">Tags</span>
            {displayTags.map(tag => (
              <span key={tag.id} className="detail-tag detail-tag--editable">
                {tagLabel(tag, catalogTags)}
                <button
                  type="button"
                  className="detail-tag-remove"
                  aria-label={`Remover tag ${tagLabel(tag, catalogTags)}`}
                  disabled={tagsBusy}
                  onClick={async () => {
                    if (isCreate) {
                      setPendingTagIds((ids) => ids.filter((tid) => tid !== tag.id));
                      return;
                    }
                    if (!id) return;
                    setTagsBusy(true);
                    setError(null);
                    try {
                      await executarEscrita(() => removePraiseTag(id, tag.id));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Falha ao remover tag');
                    } finally {
                      setTagsBusy(false);
                    }
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {availableTags.length > 0 ? (
              <div className="detail-tag-add">
                <SearchableSelect
                  value={tagToAdd}
                  onChange={setTagToAdd}
                  options={tagSelectOptions}
                  placeholder="Adicionar tag…"
                  searchPlaceholder="Buscar tag…"
                  disabled={tagsBusy}
                  aria-label="Adicionar tag"
                />
                <button
                  type="button"
                  className="auth-btn"
                  disabled={!tagToAdd || tagsBusy || (!isCreate && !id)}
                  onClick={async () => {
                    if (!tagToAdd) return;
                    if (isCreate) {
                      setPendingTagIds((ids) => (ids.includes(tagToAdd) ? ids : [...ids, tagToAdd]));
                      setTagToAdd('');
                      return;
                    }
                    if (!id) return;
                    setTagsBusy(true);
                    setError(null);
                    try {
                      await executarEscrita(() => addPraiseTag(id, tagToAdd));
                      setTagToAdd('');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Falha ao adicionar tag');
                    } finally {
                      setTagsBusy(false);
                    }
                  }}
                >
                  Adicionar
                </button>
              </div>
            ) : (
              displayTags.length === 0 && catalogTags.length > 0
                ? <span className="detail-tags-hint muted">Todas as tags do catálogo já estão associadas.</span>
                : null
            )}
            {rootTags.length > 0 ? (
              <div className="detail-subtag-block">
                <span className="detail-tags-label">Nova subtag</span>
                <div className="detail-tag-add">
                  <SearchableSelect
                    value={newSubtagParentId}
                    onChange={setNewSubtagParentId}
                    options={rootSelectOptions}
                    placeholder="Tag pai…"
                    searchPlaceholder="Buscar pai…"
                    disabled={subtagBusy || tagsBusy}
                    aria-label="Tag pai da subtag"
                  />
                  <input
                    type="text"
                    className="edit-input detail-subtag-name-input"
                    value={newSubtagName}
                    onChange={(e) => setNewSubtagName(e.target.value)}
                    placeholder="ex.: 4.2026"
                    disabled={subtagBusy || tagsBusy}
                    aria-label="Nome da subtag"
                  />
                  <button
                    type="button"
                    className="auth-btn"
                    disabled={!newSubtagParentId || !newSubtagName.trim() || subtagBusy || tagsBusy || (!isCreate && !id)}
                    onClick={() => void criarEAssociarSubtag()}
                  >
                    {subtagBusy
                      ? 'Criando…'
                      : subtagCriada
                        ? 'Associar ao louvor'
                        : 'Criar e associar'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          praise && praise.tags && praise.tags.length > 0 && (
            <div className="detail-tags">
              {praise.tags.map(tag => (
                <span key={tag.id} className="detail-tag">{tagLabel(tag)}</span>
              ))}
            </div>
          )
        )}

        {isEditing && userName ? (
          <hr className="detail-section-divider" />
        ) : null}

        {isEditing && userName && !isCreate && id ? (
          <div className="praise-group-edit">
            <span className="detail-tags-label">Agrupar louvor</span>
            {!showGroupInput ? (
              <button
                type="button"
                className="auth-btn"
                onClick={() => setShowGroupInput(true)}
              >
                Agrupar Louvor
              </button>
            ) : (
              <div className="praise-group-form">
                <input
                  type="text"
                  className="edit-input"
                  value={groupTargetId}
                  onChange={(e) => setGroupTargetId(e.target.value)}
                  placeholder="ID do louvor a agrupar"
                  aria-label="ID do louvor a agrupar"
                  disabled={groupingBusy}
                />
                <button
                  type="button"
                  className="auth-btn"
                  disabled={!groupTargetId.trim() || groupingBusy}
                  onClick={async () => {
                    setGroupingBusy(true);
                    setError(null);
                    try {
                      await executarEscrita(() => groupPraise(id, groupTargetId.trim()));
                      setGroupTargetId('');
                      setShowGroupInput(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Falha ao agrupar louvor');
                    } finally {
                      setGroupingBusy(false);
                    }
                  }}
                >
                  {groupingBusy ? 'Agrupando…' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  className="auth-btn"
                  disabled={groupingBusy}
                  onClick={() => {
                    setShowGroupInput(false);
                    setGroupTargetId('');
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        ) : null}

        {praise && praise.group_members && praise.group_members.length > 0 ? (
          <div className="praise-group-card">
            <div className="praise-group-card-title">Louvores agrupados</div>
            <ul className="praise-group-list">
              {praise.group_members.map((member) => (
                <li key={member.id}>
                  <a href={`/praise/${member.id}`} target="_blank" rel="noopener noreferrer">
                    {member.tags.length > 0 ? (
                      <span className="col-tags-list">
                        {member.tags.map((tag) => (
                          <span key={tag.id} className="detail-tag">{tagLabel(tag)}</span>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">{member.id.slice(0, 8)}…</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </header>

      <section className="detail-section animate-fade-in-up">
        <h2 className="detail-section-title">
          <span className="detail-section-icon">📝</span>
          Letra
        </h2>
        {isEditing ? (
          <>
            <textarea
              className="lyrics-editor"
              value={edit.lyrics}
              onChange={(e) => setEdit(s => ({ ...s, lyrics: e.target.value }))}
              placeholder="Cole a letra aqui…"
              rows={10}
            />
            {!isCreate && id ? (
              <div className="detail-section-actions">
                <button
                  type="button"
                  className="auth-btn"
                  disabled={savingLyrics}
                  onClick={() => void saveLyrics()}
                >
                  {savingLyrics ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            ) : null}
          </>
        ) : praise?.lyrics ? (
            <pre className="lyrics-content">{praise.lyrics}</pre>
          ) : (
            <div className="lyrics-empty">Sem letra cadastrada.</div>
          )}
      </section>

      {youtubeMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">▶</span>
            YouTube
          </h2>
          <div className="yt-grid">
            {youtubeMaterials.map(m => {
              const ytId = m.url ? parseYouTubeId(m.url) : null;
              const thumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;
              return (
                <div key={m.id} className="yt-card-wrap">
                  <a
                    className="yt-card"
                    href={m.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="yt-thumb">
                      {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="yt-thumb-fallback">YouTube</div>}
                      <div className="yt-badge">YouTube</div>
                    </div>
                    <div className="yt-body">
                      <div className="yt-title">{praise?.name ?? ''}</div>
                      <div className="yt-meta">{m.material_kind_name || 'Vídeo'}</div>
                    </div>
                  </a>
                  {canEditMaterialsInline ? (
                    <div className="materials-placeholder materials-placeholder--inline">
                      Edição de categoria — em breve
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {userName && isCreate && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🧩</span>
            Materiais (após salvar)
          </h2>
          <p className="materials-panel-help">
            Salve o louvor para adicionar materiais individuais. Você pode já selecionar uma pasta local
            ou mapear o Google Drive abaixo; os arquivos serão enviados ao clicar em &quot;Criar louvor&quot;.
          </p>
          <div className="materials-admin">
            <PainelPastaLocal
              scan={bulkScan}
              arquivos={bulkFiles}
              onEscolherPasta={(files) => void runFolderScan(files)}
              onTentarDeNovo={() => folderInputRetryRef.current?.()}
              materialKindOptions={materialKindOptions}
              onKindChange={handleBulkKindChange}
              onRemove={handleBulkRemove}
            >
              <p className="bulk-scan-hint">
                Os arquivos serão enviados ao clicar em &quot;Criar louvor&quot;.
              </p>
            </PainelPastaLocal>

            <PainelImportacaoDrive
              painelRef={drivePanelRef}
              conectado={driveConnected}
              onConectar={irAutorizarDrive}
              url={driveUrl}
              onUrlChange={setDriveUrl}
              ocupado={driveBusy}
              onMapear={() => void runDriveScan()}
              scan={driveScan}
              arquivos={driveFiles}
              pulados={driveSkipped}
              materialKindOptions={materialKindOptions}
              onKindChange={handleDriveKindChange}
              onRemove={handleDriveRemove}
              acaoDoLote={
                <p className="bulk-scan-hint">
                  Os arquivos serão importados ao clicar em &quot;Criar louvor&quot;.
                </p>
              }
            />
          </div>

          <div className="detail-section-actions">
            <button
              type="button"
              className="auth-btn"
              disabled={
                savingMetadata ||
                !userName ||
                bulkTemProblema ||
                driveTemProblema ||
                bulkFiles.some((f) => !f.material_kind) ||
                driveFiles.some((f) => !f.material_kind)
              }
              onClick={() => void saveMetadata()}
            >
              {savingMetadata
                ? 'Salvando…'
                : louvorCriado
                  ? 'Tentar enviar os arquivos de novo'
                  : 'Criar louvor'}
            </button>
          </div>
        </section>
      )}

      {userName && isEditing && !isCreate && praise && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🧩</span>
            Materiais (admin)
          </h2>

          <div className="materials-admin">
            <div className="materials-panel materials-admin-new">
              <h3 className="materials-panel-title">Adicionar material</h3>
              <div className="edit-grid">
                <div className="edit-field">
                  <SearchableSelect
                    id="new-mat-kind"
                    label="Categoria"
                    value={newMat.material_kind}
                    onChange={(material_kind) => setNewMat((s) => ({ ...s, material_kind }))}
                    options={materialKindOptions}
                  />
                </div>
                <div className="edit-field">
                  <Select
                    id="new-mat-type"
                    label="Tipo do material"
                    value={newMat.type}
                    onChange={(type) => {
                      setNewMat((s) => ({
                        ...s,
                        type: type as MaterialFormType,
                        url: '',
                        file: null,
                      }));
                    }}
                    options={[...MATERIAL_TYPE_OPTIONS]}
                  />
                </div>

                {newMat.type === 'youtube' && (
                  <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="new-mat-youtube-url">Link do YouTube</label>
                    <input
                      id="new-mat-youtube-url"
                      value={newMat.url}
                      onChange={(e) => setNewMat(s => ({ ...s, url: e.target.value }))}
                      placeholder="https://youtube.com/..."
                    />
                  </div>
                )}

                {newMat.type === 'pdf' && (
                  <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Arquivo PDF</label>
                    <StyledFileInput
                      label="Escolher PDF"
                      accept=".pdf,application/pdf"
                      selectedName={newMat.file?.name ?? null}
                      onChange={(files) => {
                        setNewMat(s => ({ ...s, file: files[0] ?? null }));
                      }}
                    />
                  </div>
                )}

                {newMat.type === 'mp3' && (
                  <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Arquivo de áudio</label>
                    <StyledFileInput
                      label="Escolher MP3"
                      accept="audio/mpeg,.mp3,audio/*"
                      selectedName={newMat.file?.name ?? null}
                      onChange={(files) => {
                        setNewMat(s => ({ ...s, file: files[0] ?? null }));
                      }}
                    />
                  </div>
                )}

                {newMat.type === 'chord' && (
                  <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Cifra</label>
                    <div className="materials-placeholder">
                      Editor de cifras — em breve
                    </div>
                  </div>
                )}

                <div className="edit-actions">
                  <button
                    type="button"
                    className="auth-btn"
                    disabled={!id || savingMaterials || !canSubmitNewMaterial(newMat)}
                    onClick={async () => {
                      if (!id || !canSubmitNewMaterial(newMat)) return;
                      setSavingMaterials(true);
                      setError(null);
                      try {
                        let updated: PraiseDetail;
                        if (newMat.type === 'youtube') {
                          updated = await createMaterial(id, {
                            material_kind: newMat.material_kind,
                            type: 'youtube',
                            url: newMat.url.trim(),
                          });
                        } else if (newMat.type === 'pdf' || newMat.type === 'mp3') {
                          updated = await bulkUploadMaterials(id, [{
                            file: newMat.file!,
                            material_kind: newMat.material_kind,
                            type: newMat.type,
                          }]);
                        } else {
                          return;
                        }
                        aplicarEscrita(updated);
                        setNewMat({ ...DEFAULT_NEW_MAT, material_kind: newMat.material_kind });
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Falha ao criar material');
                      } finally {
                        setSavingMaterials(false);
                      }
                    }}
                  >
                    Adicionar material
                  </button>
                </div>
              </div>
            </div>

            <PainelPastaLocal
              ajuda={
                <p className="materials-panel-help">
                  Envie vários arquivos de uma vez selecionando uma pasta no computador.
                  A categoria de cada arquivo é inferida pelo nome; revise itens marcados como Desconhecido antes de enviar.
                </p>
              }
              desabilitado={bulkUploading}
              scan={bulkScan}
              arquivos={bulkFiles}
              onEscolherPasta={(files) => void runFolderScan(files)}
              onTentarDeNovo={() => folderInputRetryRef.current?.()}
              materialKindOptions={materialKindOptions}
              onKindChange={handleBulkKindChange}
              onRemove={handleBulkRemove}
            >
              <div className="edit-actions">
                <button
                  type="button"
                  className="auth-btn"
                  disabled={
                    !id ||
                    bulkUploading ||
                    bulkTemProblema ||
                    bulkFiles.some((f) => !f.material_kind)
                  }
                  onClick={async () => {
                    if (!id) return;
                    setBulkUploading(true);
                    setError(null);
                    try {
                      const updated = await bulkUploadMaterials(
                        id,
                        bulkFiles
                          .filter((f): f is BulkFileItem & { file: File } => Boolean(f.file))
                          .map(f => ({
                            file: f.file,
                            material_kind: f.material_kind,
                            type: f.type,
                            file_path_legacy: f.relPath,
                          }))
                      );
                      aplicarEscrita(updated);
                      setBulkFiles([]);
                      setBulkScan(INITIAL_BULK_SCAN);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Falha na importação em lote');
                    } finally {
                      setBulkUploading(false);
                    }
                  }}
                >
                  {bulkUploading ? 'Enviando…' : `Enviar ${bulkFiles.length} arquivo(s)`}
                </button>
              </div>
            </PainelPastaLocal>

            <PainelImportacaoDrive
              painelRef={drivePanelRef}
              ajudaExtra=" Após revisar as categorias, a importação roda em segundo plano com relatório de falhas."
              conectado={driveConnected}
              onConectar={irAutorizarDrive}
              url={driveUrl}
              onUrlChange={setDriveUrl}
              ocupado={driveBusy}
              onMapear={() => void runDriveScan()}
              scan={driveScan}
              arquivos={driveFiles}
              pulados={driveSkipped}
              materialKindOptions={materialKindOptions}
              onKindChange={handleDriveKindChange}
              onRemove={handleDriveRemove}
              acaoDoLote={
                <div className="edit-actions">
                  <button
                    type="button"
                    className="auth-btn"
                    disabled={
                      !id ||
                      driveBusy ||
                      driveTemProblema ||
                      driveFiles.some((f) => !f.material_kind) ||
                      Boolean(driveImportJob && !['done', 'completed_with_errors', 'failed'].includes(driveImportJob.status))
                    }
                    onClick={async () => {
                      if (!id) return;
                      setDriveBusy(true);
                      setError(null);
                      try {
                        const started = await startDriveImport(
                          id,
                          driveFiles
                            .filter((f) => f.driveFileId)
                            .map((f) => ({
                              drive_file_id: f.driveFileId!,
                              material_kind: f.material_kind,
                              type: f.type,
                              file_path_legacy: f.relPath,
                            }))
                        );
                        const job = await getImportJob(started.id);
                        preserveScroll(drivePanelRef.current, () => {
                          setDriveImportJob(job);
                          setDriveFiles([]);
                          setDriveScan(INITIAL_BULK_SCAN);
                        });
                      } catch (err) {
                        const message = err instanceof Error ? err.message : 'Falha ao iniciar importação do Drive';
                        if (/not connected|não está conectado/i.test(message)) {
                          irAutorizarDrive();
                          return;
                        }
                        setError(message);
                      } finally {
                        setDriveBusy(false);
                      }
                    }}
                  >
                    Importar {driveFiles.length} arquivo(s) do Drive
                  </button>
                </div>
              }
            >
              <StatusImportacaoDrive
                job={driveImportJob}
                erro={driveJobErro}
                ocupado={driveBusy}
                onTentarFalhas={() => void tentarImportacoesQueFalharam()}
              />
            </PainelImportacaoDrive>
          </div>
        </section>
      )}

      {audioMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🎵</span>
            Áudio
          </h2>
          <AudioPlayer
            materials={audioMaterials}
            getAssetUrl={getAssetUrl}
            admin={materialAdminProps}
          />
        </section>
      )}

      {pdfMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">📄</span>
            Partituras
          </h2>
          <div className="pdf-viewer-list">
            {pdfMaterials.map(m => {
              const pdfUrl = m.r2_key ? getAssetUrl(m.r2_key) : null;
              const title = m.material_kind_name || 'Partitura';
              return (
                <div key={m.id} className="pdf-viewer-block">
                  <div className="pdf-viewer-header">
                    {canEditMaterialsInline ? (
                      <MaterialInlineAdmin
                        material={m}
                        options={materialKindOptions}
                        saving={savingMaterials}
                        onUpdateKind={handleMaterialKindChange}
                        onDelete={handleMaterialDelete}
                      />
                    ) : (
                      <span className="pdf-viewer-title">{title}</span>
                    )}
                    {pdfUrl ? (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pdf-viewer-open-link"
                      >
                        Abrir em nova aba
                      </a>
                    ) : null}
                  </div>
                  {pdfUrl ? (
                    <iframe
                      title={title}
                      src={pdfUrl}
                      className="pdf-viewer-frame"
                    />
                  ) : (
                    <p className="muted">PDF indisponível</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {chordMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🎸</span>
            Acordes
          </h2>
          <div className="material-grid">
            {chordMaterials.map(m => (
              <div key={m.id} className="material-card-wrap">
                <Link
                  to={`/praise/${praise!.id}/cifra/${m.id}`}
                  className={`material-link${m.has_content === false ? ' material-link--empty' : ''}`}
                >
                  <span className="material-link-icon">🎸</span>
                  <div>
                    <div className="material-link-text">{m.material_kind_name || 'Acordes'}</div>
                    <div className="material-link-meta">
                      {m.has_content === false ? 'Sem conteúdo' : 'Cifra'}
                    </div>
                  </div>
                </Link>
                {canEditMaterialsInline ? (
                  <div className="materials-placeholder materials-placeholder--inline">
                    Edição de categoria — em breve
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {outrosGrupos.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">📎</span>
            Outros materiais
          </h2>
          <div className="material-grid">
            {outrosGrupos.flatMap((grupo) =>
              grupo.items.map((m) => {
                const href = m.r2_key ? getAssetUrl(m.r2_key) : m.url || null;
                const nome = materialDisplayName(m);
                return (
                  <div key={m.id} className="material-card-wrap">
                    {href ? (
                      <a
                        className="material-link"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="material-link-icon">📎</span>
                        <div>
                          <div className="material-link-text">{nome}</div>
                          <div className="material-link-meta">{grupo.label}</div>
                        </div>
                      </a>
                    ) : (
                      <div className="material-link material-link--empty">
                        <span className="material-link-icon">📎</span>
                        <div>
                          <div className="material-link-text">{nome}</div>
                          <div className="material-link-meta">
                            {grupo.label} · arquivo indisponível
                          </div>
                        </div>
                      </div>
                    )}
                    {canEditMaterialsInline ? (
                      <MaterialInlineAdmin
                        material={m}
                        options={materialKindOptions}
                        saving={savingMaterials}
                        onUpdateKind={handleMaterialKindChange}
                        onDelete={handleMaterialDelete}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </main>
  );
}
