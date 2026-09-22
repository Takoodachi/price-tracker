import type { PricePoint } from '@pricetracker/shared';
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { price, shortDate } from '../lib/format';
import { usePreferences } from '../lib/preferences';

/**
 * Chart conventions (single series, so no legend: the card title names it):
 * 2px line + 10% area wash in the chart color, hairline solid grid, endpoint
 * labeled, crosshair + tooltip on hover/focus (arrow keys work), and a table
 * view elsewhere so nothing depends on hovering.
 */

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = Math.max(max - min, 1);
  const rawStep = span / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? rawStep;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v));
  return ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function PriceChart({ points, height = 240 }: { points: PricePoint[]; height?: number }) {
  const { lang } = usePreferences();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const margin = { top: 16, right: 64, bottom: 28, left: 56 };
  const innerW = Math.max(width - margin.left - margin.right, 10);
  const innerH = height - margin.top - margin.bottom;

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.priceCents);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.15, hi * 0.02, 100);
    const ticks = niceTicks(Math.max(lo - pad, 0), hi + pad);
    const yMin = ticks[0]!;
    const yMax = ticks.at(-1)!;
    const x = (i: number) => (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
    const coords = points.map((p, i) => [x(i), y(p.priceCents)] as const);
    const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join('');
    const area = `${line}L${coords.at(-1)![0].toFixed(1)},${innerH}L${coords[0]![0].toFixed(1)},${innerH}Z`;
    return { ticks, x, y, coords, line, area };
  }, [points, innerW, innerH]);

  // Keep the measured wrapper mounted even with no data, so width is known when points arrive.
  if (!geometry) return <div ref={ref} className="w-full" />;

  const last = geometry.coords.at(-1)!;
  const xLabels = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);

  function indexFromPointer(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = active ?? points.length - 1;
    setActive(Math.max(0, Math.min(points.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1))));
  }

  const activePoint = active !== null ? points[active] : null;
  const activeCoord = active !== null ? geometry.coords[active] : null;
  const summary = `${points.length} days: from ${price(points[0]!.priceCents)} to ${price(points.at(-1)!.priceCents)}`;

  return (
    <div ref={ref} className="relative w-full select-none">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="block overflow-visible focus-visible:outline-offset-4"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {geometry.ticks.map((tick) => (
              <g key={tick}>
                <line x1={0} x2={innerW} y1={geometry.y(tick)} y2={geometry.y(tick)} className="stroke-line" strokeWidth={1} />
                <text
                  x={-12}
                  y={geometry.y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted text-[11px] tabular-nums"
                >
                  {price(tick)}
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text
                key={i}
                x={geometry.x(i)}
                y={innerH + 20}
                textAnchor={i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}
                className="fill-muted text-[11px]"
              >
                {shortDate(points[i]!.date, lang)}
              </text>
            ))}

            <path d={geometry.area} className="fill-chart" fillOpacity={0.1} />
            <path d={geometry.line} fill="none" className="stroke-chart" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {/* Endpoint: dot with a surface ring, value labeled in ink (never in the series color). */}
            <circle cx={last[0]} cy={last[1]} r={4} className="fill-chart stroke-surface" strokeWidth={2} />
            <text x={last[0] + 10} y={last[1]} dy="0.32em" className="fill-ink text-xs font-semibold tabular-nums">
              {price(points.at(-1)!.priceCents)}
            </text>

            {activeCoord && (
              <g pointerEvents="none">
                <line x1={activeCoord[0]} x2={activeCoord[0]} y1={0} y2={innerH} className="stroke-ink-2" strokeWidth={1} />
                <circle cx={activeCoord[0]} cy={activeCoord[1]} r={5} className="fill-chart stroke-surface" strokeWidth={2} />
              </g>
            )}

            {/* Hit area covers the whole plot: the crosshair snaps to the nearest day. */}
            <rect
              x={-8}
              y={0}
              width={innerW + 16}
              height={innerH}
              fill="transparent"
              onPointerMove={(e) => setActive(indexFromPointer(e))}
              onPointerDown={(e) => setActive(indexFromPointer(e))}
              onPointerLeave={() => setActive(null)}
            />
          </g>
        </svg>
      )}
      {activePoint && activeCoord && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-2xl border border-line bg-surface px-3 py-2 shadow-soft"
          style={{
            left: Math.min(Math.max(margin.left + activeCoord[0] - 70, 0), Math.max(width - 140, 0)),
            transform: `translateY(${Math.max(margin.top + activeCoord[1] - 64, -8)}px)`,
          }}
          role="status"
        >
          <p className="text-sm font-semibold text-ink tabular-nums">{price(activePoint.priceCents)}</p>
          <p className="text-xs text-muted">{shortDate(activePoint.date, lang)}</p>
        </div>
      )}
    </div>
  );
}

/** Compact trend for dashboard rows: de-emphasized line, current value dotted in the accent. */
export function Sparkline({ points, label, width = 120, height = 36 }: { points: PricePoint[]; label: string; width?: number; height?: number }) {
  if (points.length < 2) {
    return <span className="inline-block text-xs text-muted" style={{ width }} aria-hidden>—</span>;
  }
  const values = points.map((p) => p.priceCents);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => 3 + (i / (points.length - 1)) * (width - 6);
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (height - 8);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.priceCents).toFixed(1)}`).join('');
  const lastX = x(points.length - 1);
  const lastY = y(values.at(-1)!);
  const summary = `${label}: ${price(values[0]!)} → ${price(values.at(-1)!)}`;
  return (
    <svg width={width} height={height} role="img" aria-label={summary} className="overflow-visible">
      <title>{summary}</title>
      <path d={d} fill="none" className="stroke-muted" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={3.5} className="fill-chart stroke-surface" strokeWidth={2} />
    </svg>
  );
}
