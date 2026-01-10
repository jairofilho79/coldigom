import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePraises } from '@/hooks/usePraises';
import { PraiseCard } from '@/components/praises/PraiseCard';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Plus, Search } from 'lucide-react';

export const PraiseList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [skip, setSkip] = useState(0);
  const limit = 20;

  const { data: praises, isLoading, error } = usePraises({
    skip,
    limit,
    name: searchTerm || undefined,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600">
        Erro ao carregar praises. Tente novamente.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Praises</h1>
        <Link to="/praises/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Novo Praise
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar por nome..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setSkip(0);
          }}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {praises && praises.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {praises.map((praise) => (
            <PraiseCard key={praise.id} praise={praise} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {searchTerm ? 'Nenhum praise encontrado' : 'Nenhum praise cadastrado'}
          </p>
          {!searchTerm && (
            <Link to="/praises/create" className="mt-4 inline-block">
              <Button>Criar primeiro praise</Button>
            </Link>
          )}
        </div>
      )}

      {praises && praises.length >= limit && (
        <div className="flex justify-center space-x-4">
          <Button
            variant="outline"
            onClick={() => setSkip(Math.max(0, skip - limit))}
            disabled={skip === 0}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            onClick={() => setSkip(skip + limit)}
            disabled={praises.length < limit}
          >
            Próximo
          </Button>
        </div>
      )}
    </div>
  );
};
