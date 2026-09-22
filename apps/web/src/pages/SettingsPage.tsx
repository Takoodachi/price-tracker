import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button, Container, Segmented } from '../components/ui';
import { usePreferences, type ThemePref } from '../lib/preferences';
import type { Lang } from '../lib/translations';
import { useLogout, useMe } from '../lib/queries';

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line py-6 first:border-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="font-medium">{title}</h2>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { t, theme, setTheme, lang, setLang } = usePreferences();
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <Container className="max-w-2xl">
      <h1 className="display-tight text-4xl font-medium sm:text-5xl">{t('settingsTitle')}</h1>
      <div className="mt-10 rounded-[28px] border border-line bg-surface p-6 sm:p-8">
        <Row title={t('appearance')}>
          <Segmented<ThemePref>
            label={t('appearance')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: t('themeLight') },
              { value: 'dark', label: t('themeDark') },
              { value: 'system', label: t('themeSystem') },
            ]}
          />
        </Row>
        <Row title={t('language')}>
          <Segmented<Lang>
            label={t('language')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'English' },
              { value: 'vi', label: 'Tiếng Việt' },
            ]}
          />
        </Row>
        {user && (
          <Row title={t('account')}>
            <div className="flex items-center gap-3">
              <span className="truncate text-sm text-muted">{t('signedInAs', { email: user.email })}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
              >
                {t('logOut')}
              </Button>
            </div>
          </Row>
        )}
      </div>
    </Container>
  );
}
