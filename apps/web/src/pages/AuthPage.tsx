import { loginSchema, registerSchema } from '@pricetracker/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button, Container, TextField } from '../components/ui';
import { ApiError } from '../lib/api';
import { useT } from '../lib/preferences';
import { useAuthMutation, useMe } from '../lib/queries';
import { useToast } from '../lib/toast';

/** Only allow redirects back into this app (never to another site). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { data: user } = useMe();
  const auth = useAuthMutation(mode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (user && !auth.isPending) return <Navigate to={next} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = (mode === 'login' ? loginSchema : registerSchema).safeParse({ email, password });
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
      setErrors(fields);
      return;
    }
    setErrors({});
    auth.mutate(parsed.data, {
      onSuccess: () => {
        toast(mode === 'login' ? t('welcomeBack') : t('accountCreated'));
        navigate(next, { replace: true });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) setErrors(error.fields);
        else setFormError(error instanceof ApiError && error.code === 'network' ? t('networkError') : error.message);
      },
    });
  }

  const isLogin = mode === 'login';
  const otherLink = `${isLogin ? '/register' : '/login'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <Container className="flex justify-center pt-6 sm:pt-12">
      <div className="w-full max-w-md">
        <h1 className="display-tight text-center text-4xl font-medium sm:text-5xl">
          {isLogin ? t('loginTitle') : t('registerTitle')}
        </h1>
        <p className="mt-4 text-center text-muted">{isLogin ? t('loginSubtitle') : t('registerSubtitle')}</p>

        <form
          onSubmit={submit}
          noValidate
          className="mt-10 space-y-5 rounded-[32px] border border-line bg-surface p-6 shadow-soft sm:p-8"
        >
          <TextField
            label={t('email')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            required
          />
          <TextField
            label={t('password')}
            type="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint={isLogin ? undefined : t('passwordHint')}
            required
          />
          {formError && (
            <p role="alert" className="rounded-2xl bg-negative-soft px-4 py-3 text-sm text-negative">
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={auth.isPending}>
            {auth.isPending ? t('working') : isLogin ? t('loginButton') : t('registerButton')}
          </Button>
        </form>

        <p className="mt-6 text-center text-muted">
          {isLogin ? t('noAccount') : t('haveAccount')}{' '}
          <Link to={otherLink} className="font-medium text-ink underline-offset-4 hover:underline">
            {isLogin ? t('signUp') : t('logIn')}
          </Link>
        </p>
      </div>
    </Container>
  );
}
