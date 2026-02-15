import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { loginSchema, type LoginFormData } from '@/utils/validation';
import { Music } from 'lucide-react';

const TEST_USERNAME = 'teste';
const TEST_PASSWORD = 'teste1';

export const Login = () => {
  const { t } = useTranslation('common');
  const { login, isLoading } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: TEST_USERNAME, password: TEST_PASSWORD },
  });

  // Auto-clique no login quando a tela estiver estabilizada no DOM (facilita testes)
  useEffect(() => {
    const timer = setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const usernameInput = form.querySelector<HTMLInputElement>('input[name="username"]');
      const passwordInput = form.querySelector<HTMLInputElement>('input[name="password"]');
      const hasTestValues =
        usernameInput?.value === TEST_USERNAME && passwordInput?.value === TEST_PASSWORD;
      if (hasTestValues) form.requestSubmit();
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.username, data.password);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Music className="w-12 h-12 text-blue-600" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            {t('auth.loginTitle')}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t('auth.loginSubtitle')}{' '}
            <Link
              to="/register"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              {t('auth.createAccount')}
            </Link>
          </p>
        </div>
        <form ref={formRef} className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <Input
              label={t('label.username')}
              type="text"
              autoComplete="username"
              error={errors.username?.message}
              {...register('username')}
            />
            <Input
              label={t('label.password')}
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>
          <div>
            <Button type="submit" className="w-full" isLoading={isLoading}>
              {t('auth.loginButton')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
