'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Hand-written charts for /stats (spec 6.2), following the dataviz method:
//  thin marks (bars ≤ 24 px with 4 px rounded data ends, square at the
//  baseline; 2 px lines; ≥ 8 px dots with a 2 px surface ring), a 2 px
//  surface gap between stacked segments, hairline gridlines, a legend for
//  two or more series, a hover/focus tooltip on every mark, and a table view
//  for every chart (the light palette has slots below 3:1 contrast).
//  Colours are the --viz-* tokens in globals.css (light and dark stepped
//  separately); text always uses the text colours, never a series colour.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface Series {
  key: string;
  label: string;
  /** A CSS colour, normally `var(--viz-N)`. */
  color: string;
}

/** The categorical slots in their fixed order (never cycled). */
export const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)'];

const GAP = 2;
const RADIUS = 4;
const BAR_MAX = 24;

/** The element's content width, tracked with a ResizeObserver. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** A rectangle with rounded top corners and a square bottom (a column's data end). */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** A readable step for ~4 gridlines up to `max`. */
function niceStep(max: number): number {
  if (max <= 4) return 1;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

// ── Frame: title, legend, chart/table toggle ────────────────────────────────

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  empty,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Shown for two or more series. */
  legend?: Series[];
  table: ReactNode;
  children: ReactNode;
  /** When set, the chart is replaced by this message. */
  empty?: string | null;
  actions?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {!empty && (
            <button
              type="button"
              onClick={() => setAsTable(!asTable)}
              aria-pressed={asTable}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {asTable ? <BarChart3 className="h-3.5 w-3.5" aria-hidden /> : <Table2 className="h-3.5 w-3.5" aria-hidden />}
              {asTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </div>
      {empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          {legend && legend.length >= 2 && !asTable && <Legend series={legend} />}
          {asTable ? <div className="overflow-x-auto">{table}</div> : children}
        </>
      )}
    </section>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** A plain data table (the accessible twin of every chart). */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          {head.map((h, i) => (
            <th key={i} scope="col" className={cn('py-1.5 pr-3 font-medium', i > 0 && 'text-right')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {c}
                </th>
              ) : (
                <td key={j} className="py-1.5 pr-3 text-right tabular-nums">
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

function Tip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null;
  // Keep the box inside the chart: flip to the left of the pointer near the right edge.
  const left = Math.min(Math.max(tip.x, 0), Math.max(0, width));
  const flip = left > width - 150;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-[8rem] max-w-[14rem] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
      style={{ left, top: Math.max(0, tip.y), transform: `translate(${flip ? 'calc(-100% - 8px)' : '8px'}, -50%)` }}
    >
      {tip.content}
    </div>
  );
}

export function TipRow({ color, label, value }: { color?: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {color && <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />}
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

// ── Stacked columns (e.g. finishes per month by section) ───────────────────

export interface Column {
  key: string;
  /** Axis label ("Jan"). */
  label: string;
  /** Tooltip heading ("January 2026"). */
  full: string;
  values: Record<string, number>;
}

export function StackedColumns({
  columns,
  series,
  height = 200,
  ariaLabel,
  unit,
}: {
  columns: Column[];
  series: Series[];
  height?: number;
  ariaLabel: string;
  /** "finishes" — used in the per-column accessible label. */
  unit: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const m = { top: 8, right: 4, bottom: 22, left: 28 };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const totals = columns.map((c) => series.reduce((n, s) => n + (c.values[s.key] ?? 0), 0));
  const step = niceStep(Math.max(1, ...totals));
  const yMax = Math.max(step, Math.ceil(Math.max(1, ...totals) / step) * step);
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const band = columns.length ? innerW / columns.length : 0;
  const barW = Math.max(4, Math.min(BAR_MAX, band * 0.62));
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH;
  const everyOther = band < 26;

  const tip: TipState | null =
    active === null
      ? null
      : {
          x: m.left + band * active + band / 2 + barW / 2,
          y: y(totals[active]) + 10,
          content: (
            <div className="space-y-0.5">
              <p className="font-semibold">{columns[active].full}</p>
              {series
                .filter((s) => (columns[active].values[s.key] ?? 0) > 0)
                .map((s) => (
                  <TipRow key={s.key} color={s.color} label={s.label} value={columns[active].values[s.key]} />
                ))}
              <TipRow label="Total" value={totals[active]} />
            </div>
          ),
        };

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          {columns.map((c, i) => {
            const x = m.left + band * i + (band - barW) / 2;
            let base = 0;
            const present = series.filter((s) => (c.values[s.key] ?? 0) > 0);
            return (
              <g key={c.key}>
                {present.map((s, j) => {
                  const v = c.values[s.key] ?? 0;
                  const y0 = y(base) - (j > 0 ? GAP : 0);
                  base += v;
                  const y1 = y(base);
                  const h = Math.max(0, y0 - y1);
                  const top = j === present.length - 1;
                  return top ? (
                    <path key={s.key} d={topRounded(x, y1, barW, h, RADIUS)} fill={s.color} opacity={active === null || active === i ? 1 : 0.45} />
                  ) : (
                    <rect key={s.key} x={x} y={y1} width={barW} height={h} fill={s.color} opacity={active === null || active === i ? 1 : 0.45} />
                  );
                })}
                {(!everyOther || i % 2 === 0) && (
                  <text x={m.left + band * i + band / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {c.label}
                  </text>
                )}
                {/* The hit target: the whole band, taller than the mark. */}
                <rect
                  x={m.left + band * i}
                  y={m.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${c.full}: ${totals[i]} ${unit}${present.length > 1 ? ` (${present.map((s) => `${s.label} ${c.values[s.key]}`).join(', ')})` : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="cursor-default outline-none focus-visible:stroke-ring"
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tip tip={tip} width={width} />
    </div>
  );
}

// ── Horizontal bars (one series) ────────────────────────────────────────────

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** The value as text at the bar's tip ("12", "35%"). */
  display: string;
  /** Extra tooltip lines. */
  tip?: ReactNode;
}

export function HBars({ rows, max, color = VIZ[0], ariaLabel }: { rows: BarRow[]; max?: number; color?: string; ariaLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="space-y-1.5" aria-label={ariaLabel} onMouseLeave={() => setActive(null)}>
      {rows.map((r, i) => {
        const pct = top > 0 ? Math.max(0, Math.min(1, r.value / top)) * 100 : 0;
        return (
          <li
            key={r.key}
            tabIndex={0}
            aria-label={`${r.label}: ${r.display}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="relative grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,10rem)_1fr]"
          >
            <span className="truncate text-xs text-muted-foreground" title={r.label}>
              {r.label}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-3.5 shrink-0 rounded-r"
                style={{
                  width: `calc(${pct}% * 0.82)`,
                  minWidth: r.value > 0 ? 2 : 0,
                  background: color,
                  opacity: active === null || active === i ? 1 : 0.45,
                  borderTopRightRadius: RADIUS,
                  borderBottomRightRadius: RADIUS,
                }}
              />
              <span className="shrink-0 text-xs font-medium tabular-nums">{r.display}</span>
            </span>
            {active === i && r.tip && (
              <div role="status" className="pointer-events-none absolute right-0 top-full z-10 mt-1 max-w-[16rem] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
                {r.tip}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── 100 % stacked rows (e.g. status mix per section) ────────────────────────

export interface StackRow {
  key: string;
  label: string;
  total: number;
  values: Record<string, number>;
  /** Series label per row (status wording differs per section). */
  seriesLabel?: (s: Series) => string;
}

export function StackedRows({ rows, series, ariaLabel }: { rows: StackRow[]; series: Series[]; ariaLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <ol className="space-y-2" aria-label={ariaLabel} onMouseLeave={() => setActive(null)}>
      {rows.map((r) => {
        const present = series.filter((s) => (r.values[s.key] ?? 0) > 0);
        const name = (s: Series) => r.seriesLabel?.(s) ?? s.label;
        const describe = present.map((s) => `${name(s)} ${r.values[s.key]}`).join(', ');
        return (
          <li
            key={r.key}
            tabIndex={0}
            aria-label={`${r.label}: ${r.total} titles. ${describe}`}
            onMouseEnter={() => setActive(r.key)}
            onFocus={() => setActive(r.key)}
            onBlur={() => setActive(null)}
            className="relative grid grid-cols-[minmax(0,6.5rem)_1fr] items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,8rem)_1fr]"
          >
            <span className="truncate text-xs text-muted-foreground">{r.label}</span>
            <span className="flex h-3.5 min-w-0 gap-[2px] overflow-hidden rounded">
              {present.map((s) => (
                <span
                  key={s.key}
                  style={{
                    flexGrow: r.values[s.key],
                    flexBasis: 0,
                    background: s.color,
                    minWidth: 2,
                    opacity: active === null || active === r.key ? 1 : 0.45,
                  }}
                />
              ))}
            </span>
            {active === r.key && (
              <div role="status" className="pointer-events-none absolute right-0 top-full z-10 mt-1 w-48 space-y-0.5 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
                <p className="font-semibold">{r.label}</p>
                {present.map((s) => (
                  <TipRow
                    key={s.key}
                    color={s.color}
                    label={name(s)}
                    value={`${r.values[s.key]} · ${Math.round((r.values[s.key] / r.total) * 100)}%`}
                  />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Line with dots (e.g. average score by year) ─────────────────────────────

export interface LinePoint {
  key: string;
  label: string;
  value: number;
  /** Tooltip / accessible text for the point. */
  text: string;
}

export function DotLine({
  points,
  yMax,
  yTicks,
  formatTick,
  height = 180,
  ariaLabel,
  color = VIZ[0],
}: {
  points: LinePoint[];
  yMax: number;
  yTicks: number[];
  formatTick: (v: number) => string;
  height?: number;
  ariaLabel: string;
  color?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const m = { top: 10, right: 12, bottom: 22, left: 34 };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const band = points.length ? innerW / points.length : 0;
  const x = (i: number) => m.left + band * i + band / 2;
  const y = (v: number) => m.top + innerH - (Math.max(0, Math.min(yMax, v)) / yMax) * innerH;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const everyOther = band < 34;
  const tip: TipState | null =
    active === null ? null : { x: x(active) + 6, y: y(points[active].value), content: <p>{points[active].text}</p> };

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block overflow-visible">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + innerH} stroke="var(--viz-axis)" strokeWidth={1} />
          )}
          {points.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {points.map((p, i) => (
            <g key={p.key}>
              <circle cx={x(i)} cy={y(p.value)} r={active === i ? 5.5 : 4} fill={color} stroke="hsl(var(--card))" strokeWidth={2} />
              {(!everyOther || i % 2 === (points.length - 1) % 2) && (
                <text x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                  {p.label}
                </text>
              )}
              <rect
                x={m.left + band * i}
                y={m.top}
                width={band}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={p.text}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              />
            </g>
          ))}
        </svg>
      )}
      <Tip tip={tip} width={width} />
    </div>
  );
}
