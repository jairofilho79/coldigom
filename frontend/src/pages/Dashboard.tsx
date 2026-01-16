import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePraises } from '@/hooks/usePraises';
import { useTags } from '@/hooks/useTags';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Music, Tag, Plus } from 'lucide-react';

export const Dashboard = () => {
  const { t } = useTranslation('common');
  const { data: praises, isLoading: praisesLoading } = usePraises({ limit: 5 });
  const { data: tags, isLoading: tagsLoading } = useTags({ limit: 5 });

  if (praisesLoading || tagsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  const stats = [
    {
      name: t('page.praises'),
      count: praises?.length || 0,
      icon: Music,
      color: 'bg-blue-500',
      link: '/praises',
    },
    {
      name: t('page.tags'),
      count: tags?.length || 0,
      icon: Tag,
      color: 'bg-green-500',
      link: '/tags',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">{t('page.dashboard')}</h1>
        <Link to="/praises/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            {t('action.newPraise')}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.name}
              to={stat.link}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {stat.count}
                  </p>
                </div>
                <div className={`${stat.color} p-3 rounded-full`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">{t('label.recentPraises')}</h2>
          {praises && praises.length > 0 ? (
            <ul className="space-y-2">
              {praises.map((praise) => (
                <li key={praise.id}>
                  <Link
                    to={`/praises/${praise.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {praise.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">{t('message.noPraises')}</p>
          )}
          <Link to="/praises" className="text-blue-600 hover:underline text-sm mt-4 inline-block">
            {t('message.seeAll')}
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">{t('label.quickActions')}</h2>
          <div className="space-y-3">
            <Link to="/praises/create">
              <Button variant="outline" className="w-full justify-start">
                <Plus className="w-4 h-4 mr-2" />
                {t('action.createNewPraise')}
              </Button>
            </Link>
            <Link to="/tags">
              <Button variant="outline" className="w-full justify-start">
                <Tag className="w-4 h-4 mr-2" />
                {t('action.manageTags')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
