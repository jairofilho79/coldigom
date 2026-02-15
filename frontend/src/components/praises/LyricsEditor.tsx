import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { praiseMaterialsApi } from '@/api/praiseMaterials';
import { toast } from 'react-hot-toast';
import type { PraiseMaterialSimple } from '@/types';

type LineType = 'boldYellow' | 'yellowWithSpace' | 'normal';

interface ParsedLine {
  type: LineType;
  content: string;
}

function parseLyricsToPages(text: string): ParsedLine[][] {
  const lines = text.split(/\r?\n/);
  const pages: ParsedLine[][] = [];
  let currentPage: ParsedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
      }
      continue;
    }

    if (trimmed.startsWith('*')) {
      const content = trimmed.slice(1).trim();
      currentPage.push({ type: 'boldYellow', content: content || '' });
    } else if (trimmed.startsWith('/+')) {
      const content = trimmed.slice(2).trim();
      currentPage.push({ type: 'yellowWithSpace', content: content || '' });
    } else {
      currentPage.push({ type: 'normal', content: line });
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

function LyricsPreview({ text }: { text: string }) {
  const pages = parseLyricsToPages(text);

  if (pages.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 text-sm">
        Nenhum conteúdo para exibir.
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] overflow-y-auto space-y-6">
      {pages.map((pageLines, pageIndex) => (
        <div
          key={pageIndex}
          className="min-h-[200px] px-3 py-4 border border-gray-200 rounded-md bg-gray-50/50 break-after-page"
          style={{ pageBreakAfter: 'always' }}
        >
          <div className="space-y-1 text-sm whitespace-pre-wrap">
            {pageLines.map((item, lineIndex) => {
              if (item.type === 'boldYellow') {
                return (
                  <div
                    key={lineIndex}
                    className="font-bold text-yellow-600"
                  >
                    {item.content || '\u00A0'}
                  </div>
                );
              }
              if (item.type === 'yellowWithSpace') {
                return (
                  <div key={lineIndex}>
                    <div className="h-6" aria-hidden="true" />
                    <div className="text-yellow-600">
                      {item.content || '\u00A0'}
                    </div>
                  </div>
                );
              }
              return (
                <div key={lineIndex} className="text-gray-900">
                  {item.content}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface LyricsEditorProps {
  material: PraiseMaterialSimple;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const LyricsEditor = ({
  material,
  isOpen,
  onClose,
  onSaved,
}: LyricsEditorProps) => {
  const { t } = useTranslation('common');
  const [text, setText] = useState(material.path);
  const [mode, setMode] = useState<'editor' | 'preview'>('editor');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(material.path);
    setError(null);
  }, [material.id, material.path]);

  const handleSave = async () => {
    if (text === material.path) {
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await praiseMaterialsApi.updateMaterial(material.id, { path: text });
      toast.success(t('message.saveSuccess') || 'Salvo com sucesso!');
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('message.error');
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (text !== material.path && !window.confirm(t('message.unsavedChanges') || 'Há alterações não salvas. Deseja sair?')) {
      return;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('label.lyricsEditor') || 'Letra'}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setMode('editor')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'editor'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('label.editor') || 'Editar'}
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'preview'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('label.preview') || 'Ver'}
          </button>
        </div>

        {mode === 'editor' ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm whitespace-pre-wrap"
            placeholder={t('label.textContent') || 'Conteúdo da letra...'}
          />
        ) : (
          <LyricsPreview text={text} />
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            {t('button.close')}
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
            {t('button.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
