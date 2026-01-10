import { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Upload, X } from 'lucide-react';

interface MaterialUploadProps {
  onUpload: (file: File) => void;
  isLoading?: boolean;
  materialKindId?: string;
  praiseId?: string;
}

export const MaterialUpload = ({
  onUpload,
  isLoading = false,
  materialKindId,
  praiseId,
}: MaterialUploadProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile && materialKindId && praiseId) {
      onUpload(selectedFile);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Selecionar Arquivo
        </label>
        <div className="flex items-center space-x-4">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Upload className="w-4 h-4 mr-2" />
            Escolher Arquivo
          </label>
          {selectedFile && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">{selectedFile.name}</span>
              <button
                type="button"
                onClick={handleRemove}
                className="text-red-600 hover:text-red-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      {selectedFile && materialKindId && praiseId && (
        <Button onClick={handleUpload} isLoading={isLoading}>
          Enviar Arquivo
        </Button>
      )}
    </div>
  );
};
