import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePraiseList } from '@/hooks/usePraiseLists';
import { PraiseListDetail } from '@/components/praiseLists/PraiseListDetail';

export const PraiseListDetailPage = () => {
  return <PraiseListDetail />;
};
