import clsx from 'clsx';
import { LogOut, Menu, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { useT } from '../lib/preferences';
import { useLogout, useMe } from '../lib/queries';
import { Logo } from './bits';
import { ButtonLink, Container } from './ui';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return clsx(
    'rounded-full px-4 py-2 text-[15px] font-medium transition-colors',
    isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink',
  );
}

function AccountMenu({ email }: { email: string }) {
  const t = useT();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('account')}
        className="flex size-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-canvas uppercase"
      >
        {email.charAt(0)}
      </button>
      {open && (
        <div
          role="menu"
          className="animate-rise absolute top-12 right-0 w-60 rounded-3xl border border-line bg-surface p-2 shadow-lift"
        >
          <p className="truncate px-3 pt-2 pb-3 text-sm text-muted">{email}</p>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
            className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[15px] hover:bg-surface-2"
          >
            <Settings className="size-4 text-muted" aria-hidden /> {t('settings')}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                  navigate('/');
                },
              })
            }
            className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[15px] hover:bg-surface-2"
          >
            <LogOut className="size-4 text-muted" aria-hidden /> {t('logOut')}
          </button>
        </div>
      )}
    </div>
  );
}

function Nav() {
  const t = useT();
  const { data: user, isPending } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname, location.search]);

  return (
    <header className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-4">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between rounded-full bg-surface py-3 pr-3 pl-5 shadow-soft sm:pl-7">
        <Logo />
        <div className="hidden items-center gap-1 md:flex">
          <NavLink to="/" end className={navLinkClass}>
            {t('search')}
          </NavLink>
          <NavLink to="/dashboard" className={navLinkClass}>
            {t('dashboard')}
          </NavLink>
        </div>
        <div className="flex items-center gap-2">
          {isPending ? (
            <span className="size-10" />
          ) : user ? (
            <AccountMenu email={user.email} />
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                {t('logIn')}
              </ButtonLink>
              <ButtonLink to="/register" size="sm" className="h-10 px-4">
                {t('signUp')}
              </ButtonLink>
            </>
          )}
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? t('closeMenu') : t('openMenu')}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      {mobileOpen && (
        <div className="animate-rise mx-auto mt-2 flex max-w-5xl flex-col gap-1 rounded-3xl bg-surface p-2 shadow-soft md:hidden">
          <NavLink to="/" end className={navLinkClass}>
            {t('search')}
          </NavLink>
          <NavLink to="/dashboard" className={navLinkClass}>
            {t('dashboard')}
          </NavLink>
          <NavLink to="/settings" className={navLinkClass}>
            {t('settings')}
          </NavLink>
          {!user && (
            <NavLink to="/login" className={navLinkClass}>
              {t('logIn')}
            </NavLink>
          )}
        </div>
      )}
    </header>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer className="mt-24 border-t border-line">
      <Container className="flex flex-col gap-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <Logo className="opacity-80" />
        <p className="max-w-md sm:text-right">{t('footerNote')}</p>
      </Container>
    </footer>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav />
      <main className="flex-1 pt-24 sm:pt-28">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
