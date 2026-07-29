import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPraise, getAssetUrl, getPraiseDownloadZipUrl, getLoginUrl, createPraise, updatePraise, groupPraise, getMaterialKinds, getTags, createTag, addPraiseTag, removePraiseTag, createMaterial, updateMaterial, deleteMaterial, bulkUploadMaterials, getDriveStatus, getDriveConnectUrl, startDriveScan, startDriveImport, getImportJob, retryFailedImportItems, type ImportJobSummary } from '../services/api';
import { AudioPlayer } from '../components/AudioPlayer';
import { MaterialInlineAdmin } from '../components/MaterialInlineAdmin';
import { StyledFileInput } from '../components/StyledFileInput';
import {
  BulkFolderScanStatus,
  InferenceBadge,
  INITIAL_BULK_SCAN,
  type BulkScanState,
} from '../components/BulkFolderScanStatus';
import { Select } from '../components/Select';
import { SearchableSelect } from '../components/SearchableSelect';
import { groupMaterialsByType } from '../lib/materials';
import {
  folderNameFromFiles,
  scanFolderFilesAsync,
  mapDriveFilesAsync,
  type BulkFileItem,
} from '../lib/materialKindInference/scanFolder';
import type { PraiseDetail, Tag, MaterialKind } from '../types';

function tagLabel(tag: Tag, catalog?: Tag[]): string {
  if (tag.parent_name) return `${tag.parent_name} · ${tag.name}`;
  if (tag.parent_id && catalog) {
    const parent = catalog.find((t) => t.id === tag.parent_id);
    if (parent) return `${parent.name} · ${tag.name}`;
  }
  return tag.name;
}

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

function driveItemLabel(status: string): string {
  if (status === 'done') return 'Ok';
  if (status === 'failed') return 'Falha';
  if (status === 'running') return 'Importando…';
  return 'Na fila';
}

function canSubmitNewMaterial(mat: NewMaterialForm): boolean {
  if (!mat.material_kind) return false;
  if (mat.type === 'youtube') return mat.url.trim().length > 0;
  if (mat.type === 'pdf' || mat.type === 'mp3') return mat.file !== null;
  return false;
}

const BULK_LIST_PREVIEW = 25;

function drivePreviewUrl(driveFileId: string): string {
  return `https://drive.google.com/file/d/${driveFileId}/view`;
}

function openLocalFilePreview(file: File): void {
  const url = URL.createObjectURL(file);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function BulkFilePreviewList({
  files,
  materialKindOptions,
  onKindChange,
  onRemove,
  editable = true,
}: {
  files: BulkFileItem[];
  materialKindOptions: Array<{ value: string; label: string }>;
  onKindChange?: (index: number, material_kind: string) => void;
  onRemove?: (index: number) => void;
  editable?: boolean;
}) {
  if (files.length === 0) return null;

  return (
    <div className="bulk-list">
      {files.slice(0, BULK_LIST_PREVIEW).map((it, idx) => {
        const size = it.sizeBytes ?? it.file?.size;
        const canPreview = Boolean(it.driveFileId || it.file);
        return (
          <div key={`${it.driveFileId || ''}-${it.relPath}-${idx}`} className="bulk-row">
            <div className="bulk-main">
              <div className="bulk-name">{it.relPath}</div>
              <div className="bulk-meta">
                <span className="pill">{it.type}</span>
                <InferenceBadge inference={it.inference} />
                {typeof size === 'number' ? (
                  <span className="bulk-size">{Math.round(size / 1024)} KB</span>
                ) : null}
              </div>
            </div>
            {editable && onKindChange ? (
              <SearchableSelect
                compact
                value={it.material_kind}
                onChange={(v) => onKindChange(idx, v)}
                options={materialKindOptions}
                aria-label="Categoria do material"
              />
            ) : (
              <span className="bulk-kind-readonly pill">
                {materialKindOptions.find((o) => o.value === it.material_kind)?.label ?? '—'}
              </span>
            )}
            {canPreview || (editable && onRemove) ? (
              <div className="bulk-actions">
                {it.driveFileId ? (
                  <a
                    className="bulk-remove"
                    href={drivePreviewUrl(it.driveFileId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ver ${it.relPath} no Google Drive`}
                  >
                    Ver
                  </a>
                ) : it.file ? (
                  <button
                    type="button"
                    className="bulk-remove"
                    aria-label={`Ver ${it.relPath}`}
                    onClick={() => openLocalFilePreview(it.file!)}
                  >
                    Ver
                  </button>
                ) : null}
                {editable && onRemove ? (
                  <button
                    type="button"
                    className="bulk-remove"
                    aria-label="Remover da importação"
                    onClick={() => onRemove(idx)}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {files.length > BULK_LIST_PREVIEW && (
        <div className="lyrics-empty">… e mais {files.length - BULK_LIST_PREVIEW} arquivo(s)</div>
      )}
    </div>
  );
}

export function PraiseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isCreate = id === 'new';
  const { user, ready: authReady, logout } = useAuth();
  const userName = authReady ? (user?.name || user?.email || null) : null;
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(isCreate);
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [savingLyrics, setSavingLyrics] = useState(false);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>([]);
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
  const driveScanAbortRef = useRef<AbortController | null>(null);
  const drivePanelRef = useRef<HTMLDivElement | null>(null);
  const [catalogTags, setCatalogTags] = useState<Tag[]>([]);
  const [tagToAdd, setTagToAdd] = useState('');
  const [tagsBusy, setTagsBusy] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
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
        setEdit({
          name: data.name || '',
          number: data.number || '',
          author: data.author || '',
          rhythm: data.rhythm || '',
          tonality: data.tonality || '',
          category: data.category || '',
          lyrics: data.lyrics || '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load praise');
      } finally {
        setLoading(false);
      }
    };

    fetchPraise();
  }, [id]);

  useEffect(() => {
    const fetchKinds = async () => {
      try {
        const kinds = await getMaterialKinds();
        setMaterialKinds(kinds);
        if (!newMat.material_kind && kinds.length > 0) {
          setNewMat(s => ({ ...s, material_kind: kinds[0].id }));
        }
      } catch {
        // ignore
      }
    };
    fetchKinds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const auth = new URLSearchParams(window.location.search).get('auth');
    if (auth === 'drive_connected') {
      setDriveConnected(true);
      setError(null);
    } else if (auth === 'drive_error') {
      setError('Não foi possível conectar o Google Drive. Tente novamente.');
    }
  }, []);

  useEffect(() => {
    const jobId = (location.state as { driveImportJobId?: string } | null)?.driveImportJobId;
    if (!jobId || isCreate) return;
    void getImportJob(jobId)
      .then((job) => setDriveImportJob(job))
      .catch(() => undefined);
  }, [location.state, isCreate]);

  useEffect(() => {
    if (!driveImportJob?.id) return;
    const terminal = ['done', 'completed_with_errors', 'failed'].includes(driveImportJob.status);
    if (terminal) {
      const failed = driveImportJob.items?.filter((i) => i.status === 'failed') ?? [];
      if (failed.length > 0) {
        console.error('[Drive import] falhas técnicas', failed.map((i) => ({
          path: i.file_path_legacy || i.drive_file_id,
          error: i.error,
        })));
      }
      return;
    }
    const t = window.setInterval(() => {
      void getImportJob(driveImportJob.id)
        .then(async (job) => {
          setDriveImportJob(job);
          if (['done', 'completed_with_errors', 'failed'].includes(job.status) && id && id !== 'new') {
            try {
              const refreshed = await getPraise(id);
              preserveScroll(drivePanelRef.current, () => setPraise(refreshed));
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(t);
  }, [driveImportJob?.id, driveImportJob?.status, id, driveImportJob?.items]);

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
        window.location.href = getDriveConnectUrl(window.location.href);
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
        window.location.href = getDriveConnectUrl(window.location.href);
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
  }, [driveUrl, driveConnected, materialKinds]);

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
        error: 'Catálogo de categorias ainda carregando. Aguarde um instante e clique em “Tentar novamente”.',
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
  }, [materialKinds]);

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
  const canEditMaterialsInline = Boolean(userName && isEditing && !isCreate);

  const handleMaterialKindChange = async (materialId: string, material_kind: string) => {
    setSavingMaterials(true);
    setError(null);
    try {
      const updated = await updateMaterial(materialId, { material_kind });
      setPraise(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar material');
    } finally {
      setSavingMaterials(false);
    }
  };

  const handleMaterialDelete = async (materialId: string) => {
    setSavingMaterials(true);
    setError(null);
    try {
      const updated = await deleteMaterial(materialId);
      setPraise(updated);
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
      <div className="page-container detail-page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <div className="loading-text">Carregando louvor...</div>
        </div>
      </div>
    );
  }

  if (!isCreate && error && !praise) {
    return (
      <div className="page-container detail-page">
        <div className="error-state">
          <div className="error-state-icon">⚠</div>
          <div className="error-state-title">Erro ao carregar</div>
          <div className="error-state-desc">{error}</div>
        </div>
      </div>
    );
  }

  if (!isCreate && !praise) {
    return (
      <div className="page-container detail-page">
        <div className="no-results">
          <div className="no-results-icon">📖</div>
          <div className="no-results-title">Louvor não encontrado</div>
        </div>
      </div>
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
    try {
      if (isCreate) {
        if (!edit.name.trim()) {
          setError('Nome é obrigatório');
          return;
        }
        if (bulkFiles.some((f) => !f.material_kind) || driveFiles.some((f) => !f.material_kind)) {
          setError('Defina a categoria de todos os arquivos antes de criar');
          return;
        }
        let created = await createPraise({
          name: edit.name.trim(),
          number: edit.number || null,
          author: edit.author || null,
          rhythm: edit.rhythm || null,
          tonality: edit.tonality || null,
          category: edit.category || null,
          lyrics: edit.lyrics || null,
          tag_ids: pendingTagIds,
        });
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
      } else if (id) {
        const updated = await updatePraise(id, {
          name: edit.name,
          number: edit.number,
          author: edit.author,
          rhythm: edit.rhythm,
          tonality: edit.tonality,
          category: edit.category,
        });
        setPraise(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar metadados');
    } finally {
      setSavingMetadata(false);
    }
  };

  const saveLyrics = async () => {
    if (!id || isCreate) return;
    setSavingLyrics(true);
    setError(null);
    try {
      const updated = await updatePraise(id, { lyrics: edit.lyrics });
      setPraise(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar letra');
    } finally {
      setSavingLyrics(false);
    }
  };

  return (
    <div className="page-container detail-page">
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

      <header className="detail-header animate-fade-in-scale">
        <div className="auth-row">
          {!authReady ? (
            <div className="auth-user muted">Verificando sessão…</div>
          ) : userName ? (
            <>
              {user?.picture ? (
                <img className="auth-avatar" src={user.picture} alt="" width={28} height={28} />
              ) : null}
              <div className="auth-user">Logado como <strong>{userName}</strong></div>
              {isCreate ? (
                <Link to="/" className="auth-btn">
                  Cancelar
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    className="auth-btn"
                    onClick={() => setIsEditing(v => !v)}
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
              <button
                type="button"
                className="auth-btn"
                onClick={async () => {
                  await logout();
                  setIsEditing(false);
                }}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              {!isCreate && id ? (
                <a
                  className="auth-btn"
                  href={getPraiseDownloadZipUrl(id)}
                  download
                >
                  Baixar em ZIP
                </a>
              ) : null}
              <a
                className="auth-btn"
                href={getLoginUrl()}
              >
                Entrar com Google
              </a>
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
            <div className="edit-field">
              <label>Nome</label>
              <input value={edit.name} onChange={(e) => setEdit(s => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Número</label>
              <input value={edit.number} onChange={(e) => setEdit(s => ({ ...s, number: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Autor</label>
              <input value={edit.author} onChange={(e) => setEdit(s => ({ ...s, author: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Ritmo</label>
              <input value={edit.rhythm} onChange={(e) => setEdit(s => ({ ...s, rhythm: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Tom</label>
              <input value={edit.tonality} onChange={(e) => setEdit(s => ({ ...s, tonality: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Categoria</label>
              <input value={edit.category} onChange={(e) => setEdit(s => ({ ...s, category: e.target.value }))} />
            </div>

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
                    window.setTimeout(() => setIdCopied(false), 2000);
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
                      const updated = await removePraiseTag(id, tag.id);
                      setPraise(updated);
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
                      const updated = await addPraiseTag(id, tagToAdd);
                      setPraise(updated);
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
                    onClick={async () => {
                      if (!newSubtagParentId || !newSubtagName.trim()) return;
                      setSubtagBusy(true);
                      setError(null);
                      try {
                        const created = await createTag({
                          name: newSubtagName.trim(),
                          parent_id: newSubtagParentId,
                        });
                        setCatalogTags((prev) => [...prev, created]);
                        if (isCreate) {
                          setPendingTagIds((ids) => (ids.includes(created.id) ? ids : [...ids, created.id]));
                        } else if (id) {
                          const updated = await addPraiseTag(id, created.id);
                          setPraise(updated);
                        }
                        setNewSubtagName('');
                        setNewSubtagParentId('');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Falha ao criar subtag');
                      } finally {
                        setSubtagBusy(false);
                      }
                    }}
                  >
                    {subtagBusy ? 'Criando…' : 'Criar e associar'}
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
                      const updated = await groupPraise(id, groupTargetId.trim());
                      setPraise(updated);
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
            <div className="materials-panel materials-admin-bulk">
              <h3 className="materials-panel-title">Importação em lote (pasta)</h3>
              <StyledFileInput
                label="Escolher pasta"
                directory
                disabled={bulkScan.phase === 'scanning'}
                selectedName={
                  bulkScan.folderName
                    ? `${bulkScan.folderName} (${bulkScan.total || bulkFiles.length} arquivo(s))`
                    : bulkFiles.length > 0
                      ? `${bulkFiles.length} arquivo(s)`
                      : null
                }
                onChange={(files) => {
                  void runFolderScan(files);
                }}
              />
              <BulkFolderScanStatus
                scan={bulkScan}
                files={bulkFiles}
                onRetry={() => folderInputRetryRef.current?.()}
              />
              {bulkScan.phase === 'done' && bulkFiles.length > 0 && (
                <>
                  <BulkFilePreviewList
                    files={bulkFiles}
                    materialKindOptions={materialKindOptions}
                    onKindChange={handleBulkKindChange}
                    onRemove={handleBulkRemove}
                    editable
                  />
                  <p className="bulk-scan-hint">
                    Os arquivos serão enviados ao clicar em &quot;Criar louvor&quot;.
                  </p>
                </>
              )}
            </div>

            <div className="materials-panel materials-admin-bulk" ref={drivePanelRef}>
              <h3 className="materials-panel-title">Importar do Google Drive</h3>
              <p className="materials-panel-help">
                Cole o link de uma pasta ou arquivo do Drive. Documentos nativos do Google (Docs/Sheets) são pulados com aviso.
              </p>
              {driveConnected === false && (
                <p className="materials-panel-help">
                  É preciso autorizar o Coldigom a ler seu Drive (somente leitura).
                  {' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      window.location.href = getDriveConnectUrl(window.location.href);
                    }}
                  >
                    Conectar Google Drive
                  </button>
                </p>
              )}
              <div className="drive-url-row">
                <input
                  type="url"
                  className="edit-input"
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={driveUrl}
                  disabled={driveBusy}
                  onChange={(e) => setDriveUrl(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-btn"
                  disabled={driveBusy || !driveUrl.trim()}
                  onClick={() => void runDriveScan()}
                >
                  {driveBusy ? 'Lendo…' : 'Mapear pasta'}
                </button>
              </div>
              <BulkFolderScanStatus
                scan={driveScan}
                files={driveFiles}
                onRetry={() => void runDriveScan()}
              />
              {driveSkipped.length > 0 && (
                <div className="drive-skipped">
                  <strong>{driveSkipped.length} item(ns) pulado(s)</strong>
                  <ul>
                    {driveSkipped.slice(0, 8).map((s) => (
                      <li key={`${s.path}-${s.reason}`}>
                        {s.path}: {s.reason}
                      </li>
                    ))}
                    {driveSkipped.length > 8 && (
                      <li>… e mais {driveSkipped.length - 8}</li>
                    )}
                  </ul>
                </div>
              )}
              {driveScan.phase === 'done' && driveFiles.length > 0 && (
                <>
                  <BulkFilePreviewList
                    files={driveFiles}
                    materialKindOptions={materialKindOptions}
                    onKindChange={handleDriveKindChange}
                    onRemove={handleDriveRemove}
                  />
                  <p className="bulk-scan-hint">
                    Os arquivos serão importados ao clicar em &quot;Criar louvor&quot;.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="detail-section-actions">
            <button
              type="button"
              className="auth-btn"
              disabled={
                savingMetadata ||
                !userName ||
                bulkFiles.some((f) => !f.material_kind) ||
                driveFiles.some((f) => !f.material_kind)
              }
              onClick={() => void saveMetadata()}
            >
              {savingMetadata ? 'Salvando…' : 'Criar louvor'}
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
                        setPraise(updated);
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

            <div className="materials-panel materials-admin-bulk">
              <h3 className="materials-panel-title">Importação em lote (pasta)</h3>
              <p className="materials-panel-help">
                Envie vários arquivos de uma vez selecionando uma pasta no computador.
                A categoria de cada arquivo é inferida pelo nome; revise itens marcados como Desconhecido antes de enviar.
              </p>
              <StyledFileInput
                label="Escolher pasta"
                directory
                disabled={bulkScan.phase === 'scanning' || bulkUploading}
                selectedName={
                  bulkScan.folderName
                    ? `${bulkScan.folderName} (${bulkScan.total || bulkFiles.length} arquivo(s))`
                    : bulkFiles.length > 0
                      ? `${bulkFiles.length} arquivo(s)`
                      : null
                }
                onChange={(files) => {
                  void runFolderScan(files);
                }}
              />
              <BulkFolderScanStatus
                scan={bulkScan}
                files={bulkFiles}
                onRetry={() => folderInputRetryRef.current?.()}
              />

              {bulkScan.phase === 'done' && bulkFiles.length > 0 && (
                <>
                  <BulkFilePreviewList
                    files={bulkFiles}
                    materialKindOptions={materialKindOptions}
                    onKindChange={handleBulkKindChange}
                    onRemove={handleBulkRemove}
                  />

                  <div className="edit-actions">
                    <button
                      type="button"
                      className="auth-btn"
                      disabled={!id || bulkUploading || bulkFiles.some(f => !f.material_kind)}
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
                          setPraise(updated);
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
                </>
              )}
            </div>

            <div className="materials-panel materials-admin-bulk" ref={drivePanelRef}>
              <h3 className="materials-panel-title">Importar do Google Drive</h3>
              <p className="materials-panel-help">
                Cole o link de uma pasta ou arquivo do Drive. Documentos nativos do Google (Docs/Sheets) são pulados com aviso.
                Após revisar as categorias, a importação roda em segundo plano com relatório de falhas.
              </p>
              {driveConnected === false && (
                <p className="materials-panel-help">
                  É preciso autorizar o Coldigom a ler seu Drive (somente leitura).
                  {' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      window.location.href = getDriveConnectUrl(window.location.href);
                    }}
                  >
                    Conectar Google Drive
                  </button>
                </p>
              )}
              <div className="drive-url-row">
                <input
                  type="url"
                  className="edit-input"
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={driveUrl}
                  disabled={driveBusy}
                  onChange={(e) => setDriveUrl(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-btn"
                  disabled={driveBusy || !driveUrl.trim()}
                  onClick={() => void runDriveScan()}
                >
                  {driveBusy ? 'Lendo…' : 'Mapear pasta'}
                </button>
              </div>
              <BulkFolderScanStatus
                scan={driveScan}
                files={driveFiles}
                onRetry={() => void runDriveScan()}
              />
              {driveSkipped.length > 0 && (
                <div className="drive-skipped">
                  <strong>{driveSkipped.length} item(ns) pulado(s)</strong>
                  <ul>
                    {driveSkipped.slice(0, 8).map((s) => (
                      <li key={`${s.path}-${s.reason}`}>
                        {s.path}: {s.reason}
                      </li>
                    ))}
                    {driveSkipped.length > 8 && (
                      <li>… e mais {driveSkipped.length - 8}</li>
                    )}
                  </ul>
                </div>
              )}
              {driveScan.phase === 'done' && driveFiles.length > 0 && (
                <>
                  <BulkFilePreviewList
                    files={driveFiles}
                    materialKindOptions={materialKindOptions}
                    onKindChange={handleDriveKindChange}
                    onRemove={handleDriveRemove}
                  />
                  <div className="edit-actions">
                    <button
                      type="button"
                      className="auth-btn"
                      disabled={
                        !id ||
                        driveBusy ||
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
                          if (/not connected/i.test(message)) {
                            window.location.href = getDriveConnectUrl(window.location.href);
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
                </>
              )}
              {driveImportJob && (
                <div className="drive-job-status">
                  {!['done', 'completed_with_errors', 'failed'].includes(driveImportJob.status) && (
                    <p className="drive-job-stay">
                      Não saia desta tela enquanto acompanha o progresso. Fechar a aba não cancela a
                      importação no servidor, mas você deixa de ver o andamento.
                    </p>
                  )}
                  <p className="drive-job-summary">
                    <span>
                      {driveImportJob.done_count}/{driveImportJob.total_count} importados
                      {driveImportJob.failed_count > 0
                        ? ` · ${driveImportJob.failed_count} com erro`
                        : ''}
                    </span>
                    <span
                      className={`drive-job-pill drive-job-pill--${
                        driveImportJob.status === 'done'
                          ? 'ok'
                          : driveImportJob.status === 'completed_with_errors' ||
                              driveImportJob.status === 'failed'
                            ? 'err'
                            : 'run'
                      }`}
                    >
                      {driveImportJob.status === 'done'
                        ? 'Concluída'
                        : driveImportJob.status === 'completed_with_errors'
                          ? 'Concluída com erros'
                          : driveImportJob.status === 'failed'
                            ? 'Falhou'
                            : driveImportJob.status === 'running'
                              ? 'Em andamento'
                              : 'Na fila'}
                    </span>
                  </p>
                  <div
                    className="bulk-scan-progress drive-job-overall"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={driveImportJob.total_count}
                    aria-valuenow={driveImportJob.done_count + driveImportJob.failed_count}
                  >
                    <div
                      className="bulk-scan-progress-bar"
                      style={{
                        width: `${
                          driveImportJob.total_count
                            ? Math.round(
                                ((driveImportJob.done_count + driveImportJob.failed_count) /
                                  driveImportJob.total_count) *
                                  100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  {driveImportJob.items && driveImportJob.items.length > 0 && (
                    <ul className="drive-job-items">
                      {driveImportJob.items.map((item) => (
                        <li
                          key={item.id}
                          className={`drive-job-item drive-job-item--${item.status}`}
                        >
                          <div className="drive-job-item-head">
                            <span className="drive-job-item-name">
                              {item.file_path_legacy || item.drive_file_id}
                            </span>
                            <span className="drive-job-item-label">{driveItemLabel(item.status)}</span>
                          </div>
                          <div
                            className={`bulk-scan-progress${
                              item.status === 'running' ? ' drive-job-item-progress--run' : ''
                            }`}
                          >
                            <div
                              className={`bulk-scan-progress-bar${
                                item.status === 'failed' ? ' drive-job-item-bar--err' : ''
                              }${item.status === 'done' ? ' drive-job-item-bar--ok' : ''}`}
                              style={{
                                width:
                                  item.status === 'done' || item.status === 'failed'
                                    ? '100%'
                                    : item.status === 'running'
                                      ? '70%'
                                      : '0%',
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {driveImportJob.failed_count > 0 &&
                    ['done', 'completed_with_errors', 'failed'].includes(driveImportJob.status) && (
                      <>
                        <p className="drive-job-support">
                          Não foi possível importar alguns arquivos. Tente de novo ou contate o suporte.
                        </p>
                        <button
                          type="button"
                          className="auth-btn"
                          disabled={driveBusy}
                          onClick={async () => {
                            setDriveBusy(true);
                            try {
                              await retryFailedImportItems(driveImportJob.id);
                              const job = await getImportJob(driveImportJob.id);
                              preserveScroll(drivePanelRef.current, () => setDriveImportJob(job));
                            } catch (err) {
                              console.error('[Drive import] retry failed', err);
                              setError(
                                'Não foi possível tentar de novo. Contate o suporte se o problema continuar.'
                              );
                            } finally {
                              setDriveBusy(false);
                            }
                          }}
                        >
                          Tentar de novo os que falharam
                        </button>
                      </>
                    )}
                </div>
              )}
            </div>
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
                <a
                  href={m.r2_key ? getAssetUrl(m.r2_key) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="material-link"
                >
                  <span className="material-link-icon">🎸</span>
                  <div>
                    <div className="material-link-text">{m.material_kind_name || 'Acordes'}</div>
                    <div className="material-link-meta">Arquivo de acordes</div>
                  </div>
                </a>
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
    </div>
  );
}
