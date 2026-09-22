import clsx from 'clsx';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { forwardRef, useId } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost' | 'ink';
type Size = 'md' | 'lg' | 'sm';

/** Pill buttons, nomu-style: coral primary, outlined secondary, dark "ink". */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return clsx(
    'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-60 select-none',
    size === 'lg' && 'h-14 px-7 text-base',
    size === 'md' && 'h-11 px-5 text-[15px]',
    size === 'sm' && 'h-9 px-3.5 text-sm',
    variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-hover',
    variant === 'ink' && 'bg-ink text-canvas hover:opacity-90',
    variant === 'secondary' && 'border border-line-strong bg-surface text-ink hover:border-ink/40',
    variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant, size, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

/** Link to another site: new tab, no referrer, with nomu's ↗ arrow. */
export function ExternalButton({
  variant,
  size,
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    <a target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)} {...rest}>
      {children}
      <ArrowUpRight className="size-4" aria-hidden />
    </a>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField(
  { label, hint, error, className, ...rest },
  ref,
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          'h-12 w-full rounded-2xl border bg-surface px-4 text-base text-ink placeholder:text-muted',
          'transition-colors outline-none focus:border-ink/50 focus-visible:outline-none',
          error ? 'border-negative' : 'border-line-strong',
        )}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx('animate-spin', className ?? 'size-4')} aria-hidden />;
}

export function Chip({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'positive' | 'negative'; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-surface-2 text-ink-2',
        tone === 'accent' && 'bg-accent-soft text-accent-ink',
        tone === 'positive' && 'bg-positive-soft text-positive',
        tone === 'negative' && 'bg-negative-soft text-negative',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Segmented control for small either/or settings (theme, language, chart range). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-surface-2 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              'rounded-full font-medium transition-colors',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-9 px-4 text-sm',
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>;
}
