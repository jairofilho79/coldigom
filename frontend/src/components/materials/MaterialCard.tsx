import type { PraiseMaterialResponse } from '@/types';
import { File, Youtube, Music, FileText, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface MaterialCardProps {
  material: PraiseMaterialResponse;
  onDelete?: (id: string) => void;
  onDownload?: (id: string) => void;
  showActions?: boolean;
}

export const MaterialCard = ({
  material,
  onDelete,
  onDownload,
  showActions = true,
}: MaterialCardProps) => {
  const getIcon = () => {
    switch (material.type) {
      case 'file':
        return <File className="w-5 h-5 text-blue-600" />;
      case 'youtube':
        return <Youtube className="w-5 h-5 text-red-600" />;
      case 'spotify':
        return <Music className="w-5 h-5 text-green-600" />;
      case 'text':
        return <FileText className="w-5 h-5 text-gray-600" />;
      default:
        return <File className="w-5 h-5" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          {getIcon()}
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              {material.material_kind?.name || 'Material'}
            </p>
            <p className="text-sm text-gray-500 truncate">{material.path}</p>
            <p className="text-xs text-gray-400 mt-1">
              Tipo: {material.type}
            </p>
          </div>
        </div>
        {showActions && (
          <div className="flex space-x-2">
            {material.type === 'file' && onDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(material.id)}
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(material.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
