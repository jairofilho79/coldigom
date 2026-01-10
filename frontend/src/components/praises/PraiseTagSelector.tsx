import { useState } from 'react';
import type { PraiseTagResponse } from '@/types';
import { X } from 'lucide-react';

interface PraiseTagSelectorProps {
  tags: PraiseTagResponse[];
  selectedTagIds: string[];
  onSelect: (tagId: string) => void;
  onRemove: (tagId: string) => void;
}

export const PraiseTagSelector = ({
  tags,
  selectedTagIds,
  onSelect,
  onRemove,
}: PraiseTagSelectorProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTags = tags.filter(
    (tag) =>
      tag.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !selectedTagIds.includes(tag.id)
  );

  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Tags
      </label>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => onRemove(tag.id)}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                <X className="w-4 h-4" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder="Buscar tags..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md"
      />
      {filteredTags.length > 0 && (
        <div className="border border-gray-200 rounded-md max-h-40 overflow-y-auto">
          {filteredTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => {
                onSelect(tag.id);
                setSearchTerm('');
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-100"
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
