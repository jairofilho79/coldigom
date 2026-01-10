import type { PraiseMaterialSimple } from '@/types';
import { File, Youtube, Music, FileText } from 'lucide-react';

interface PraiseMaterialsListProps {
  materials: PraiseMaterialSimple[];
}

export const PraiseMaterialsList = ({ materials }: PraiseMaterialsListProps) => {
  if (materials.length === 0) {
    return (
      <div className="text-sm text-gray-500">Nenhum material adicionado</div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'file':
        return <File className="w-4 h-4" />;
      case 'youtube':
        return <Youtube className="w-4 h-4 text-red-600" />;
      case 'spotify':
        return <Music className="w-4 h-4 text-green-600" />;
      case 'text':
        return <FileText className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-2">
      {materials.map((material) => (
        <div
          key={material.id}
          className="flex items-center space-x-2 p-2 bg-gray-50 rounded-md"
        >
          {getIcon(material.type)}
          <span className="text-sm text-gray-700">{material.path}</span>
        </div>
      ))}
    </div>
  );
};
