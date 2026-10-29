'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Themes: small inline-SVG mock-ups of each layout (its
//  navigation and its cards, in that layout's own colours whatever the
//  current theme is) and of the two title views (in the current theme's
//  colours, since the title view doesn't change them). All 160 × 100 and
//  decorative: the radio around each one carries its name.
// ───────────────────────────────────────────────────────────────────────────

import { useId } from 'react';

import type { TitleView } from '@/lib/display-prefs';
import type { LayoutId } from '@/lib/layouts';

const W = 160;
const H = 100;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/** Evenly spaced columns: the x of each of `n` items of width `w` across [x0, x1]. */
function columns(n: number, x0: number, x1: number, w: number): number[] {
  const gap = n > 1 ? (x1 - x0 - n * w) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => x0 + i * (w + gap));
}

/** A gradient id that is unique on the page (useId's colons dropped for url(#…)). */
function useSvgId(): (name: string) => string {
  const base = useId().replace(/:/g, '');
  return (name) => `${base}-${name}`;
}

// ── Classic: a flat sidebar (Dashboard, Franchises, the 7 sections),
//    labelled buttons and plain bordered cards. Light zinc with violet. ──────

const CLASSIC = {
  bg: '#f9f9fb',
  side: '#f1f1f4',
  border: '#dcdce2',
  primary: '#6826d9',
  accent: '#ece5fb',
  ink: '#18181b',
  text: '#71717a',
  faint: '#a1a1aa',
  icon: '#9a9aa6',
  posters: ['#cbbff5', '#f6c9a8', '#a9dcc6', '#b3cdf2', '#f2b8b8', '#efdca0', '#c9c2e8', '#bfe0d2', '#f3d1b5', '#c2d4ee'],
};

function ClassicThumbnail() {
  const c = CLASSIC;
  const navWidths = [18, 17, 12, 14, 13, 11, 15, 12, 13];
  const cardW = 19.6;
  return (
    <Frame>
      <rect width={W} height={H} fill={c.bg} />
      <rect width={38} height={H} fill={c.side} />
      <rect x={38} width={0.6} height={H} fill={c.border} />
      <rect x={6} y={6} width={5} height={5} rx={1} fill={c.primary} />
      <rect x={13} y={7} width={16} height={3} rx={1} fill={c.ink} />
      {navWidths.map((w, i) => {
        const y = 17 + i * 7.5;
        const on = i === 0;
        return (
          <g key={i}>
            {on && <rect x={3} y={y - 2} width={32} height={6.5} rx={1.5} fill={c.accent} />}
            <rect x={6} y={y} width={2.5} height={2.5} rx={0.6} fill={on ? c.primary : c.icon} />
            <rect x={11} y={y + 0.25} width={w} height={2} rx={1} fill={on ? c.primary : c.text} />
          </g>
        );
      })}
      <rect y={88} width={38} height={0.6} fill={c.border} />
      <circle cx={8} cy={94} r={3} fill="#d4d4d8" />
      <rect x={13} y={93} width={15} height={2} rx={1} fill={c.faint} />

      <rect x={46} y={7} width={34} height={4.5} rx={1} fill={c.ink} />
      {/* Labelled toolbar: Add, the title filter, Filters, Tiers. */}
      <rect x={46} y={16} width={15} height={6} rx={1.2} fill={c.primary} />
      <rect x={49} y={18.2} width={9} height={1.6} rx={0.8} fill="#ffffff" />
      <rect x={63} y={16} width={28} height={6} rx={1.2} fill="#ffffff" stroke={c.border} strokeWidth={0.5} />
      <rect x={66} y={18.2} width={13} height={1.6} rx={0.8} fill={c.faint} />
      {[93, 110].map((x, i) => (
        <g key={x}>
          <rect x={x} y={16} width={15} height={6} rx={1.2} fill="#ffffff" stroke={c.border} strokeWidth={0.5} />
          <rect x={x + 3} y={18.2} width={i ? 8 : 9} height={1.6} rx={0.8} fill={c.text} />
        </g>
      ))}
      {[28, 63].map((y, row) =>
        columns(5, 46, 154, cardW).map((x, col) => (
          <g key={`${row}-${col}`}>
            <rect x={x} y={y} width={cardW} height={33} rx={1.5} fill="#ffffff" stroke={c.border} strokeWidth={0.5} />
            <rect x={x + 1.5} y={y + 1.5} width={cardW - 3} height={21} rx={1} fill={c.posters[row * 5 + col]} />
            <rect x={x + 2} y={y + 25.5} width={cardW - 6} height={2} rx={1} fill="#3f3f46" />
            <rect x={x + 2} y={y + 29} width={cardW - 10} height={1.6} rx={0.8} fill={c.faint} />
          </g>
        )),
      )}
    </Frame>
  );
}

// ── Minimal: the 7 sections alone in a quiet sidebar, Dashboard and the
//    avatar in a top bar, icon buttons and big airy posters. White and ink. ─

const MINIMAL = {
  bg: '#ffffff',
  line: '#ededed',
  ink: '#171717',
  text: '#a3a3a3',
  faint: '#c4c4c4',
  posters: ['#d8cfc4', '#c9d3df', '#e0cfc8', '#cdd9cc', '#d6d0e0', '#e3dccb', '#cbd5d9', '#dccbd3'],
};

function MinimalThumbnail() {
  const c = MINIMAL;
  const sectionWidths = [16, 14, 13, 15, 12, 14, 11];
  const posterW = 24;
  return (
    <Frame>
      <rect width={W} height={H} fill={c.bg} />
      <rect y={13} width={W} height={0.6} fill={c.line} />
      <rect x={7} y={5} width={14} height={3} rx={1.5} fill={c.ink} />
      <rect x={114} y={5.4} width={20} height={2.2} rx={1.1} fill="#737373" />
      <circle cx={149} cy={6.5} r={3.6} fill={c.ink} />
      <rect x={32} y={13.6} width={0.6} height={H} fill={c.line} />
      {sectionWidths.map((w, i) => {
        const y = 23 + i * 9;
        return (
          <g key={i}>
            {i === 0 && <rect x={3} y={y - 1.4} width={1.2} height={5} rx={0.6} fill={c.ink} />}
            <rect x={7} y={y} width={w} height={2.2} rx={1.1} fill={i === 0 ? c.ink : c.text} />
          </g>
        );
      })}

      <rect x={42} y={21} width={28} height={5} rx={1.5} fill={c.ink} />
      {/* Icon toolbar. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={44.5 + i * 8} cy={33} r={2.4} fill="none" stroke={c.faint} strokeWidth={0.7} />
      ))}
      {[41, 88].map((y, row) =>
        columns(4, 42, 152, posterW).map((x, col) => (
          <g key={`${row}-${col}`}>
            <rect x={x} y={y} width={posterW} height={35} rx={3} fill={c.posters[row * 4 + col]} />
            <rect x={x} y={y + 38.5} width={16} height={2} rx={1} fill="#404040" />
            <rect x={x} y={y + 42} width={10} height={1.6} rx={0.8} fill={c.faint} />
          </g>
        )),
      )}
    </Frame>
  );
}

// ── Organised: a grouped sidebar with headings, icon buttons and dense cards
//    carrying one badge each at most. Slate with blue. ───────────────────────

const ORGANISED = {
  bg: '#f4f6f9',
  side: '#e8ecf1',
  border: '#d4dae3',
  primary: '#2158cf',
  accent: '#d9e4fb',
  ink: '#0f172a',
  heading: '#94a3b8',
  text: '#475569',
  icon: '#64748b',
  faint: '#a3afc0',
  badges: ['#2158cf', null, '#d97706', null, '#16a34a', '#2158cf', null, '#7c3aed', null, '#d97706', null, '#16a34a', '#2158cf', null, null, '#d97706', null, '#2158cf'],
  posters: ['#b9c7e4', '#d9c3b0', '#bcd5c8', '#c9bfe0', '#e2c6c6', '#c4d2db', '#d6d0b8', '#b8cfe0', '#d8c1d2', '#c6d9be', '#bfc6dc', '#e0d1bd', '#c3cfe6', '#d4c8b6', '#b9d3cf', '#dcc2c2', '#c8c3e2', '#cbd8c2'],
};

function OrganisedThumbnail() {
  const c = ORGANISED;
  const groups: number[][] = [
    [17, 13, 15],
    [14, 16],
    [12, 15],
    [13, 11],
  ];
  const cardW = 16;
  let y = 15;
  const sidebar: React.ReactNode[] = [];
  groups.forEach((items, g) => {
    sidebar.push(<rect key={`h${g}`} x={5} y={y} width={g === 1 ? 18 : 13} height={1.6} rx={0.8} fill={c.heading} />);
    y += 4.5;
    items.forEach((w, i) => {
      const on = g === 0 && i === 0;
      sidebar.push(
        <g key={`${g}-${i}`}>
          {on && <rect x={2.5} y={y - 1.3} width={37} height={4.6} rx={1} fill={c.accent} />}
          <rect x={5} y={y} width={2.2} height={2.2} rx={0.5} fill={on ? c.primary : c.icon} />
          <rect x={9.5} y={y + 0.2} width={w} height={1.8} rx={0.9} fill={on ? c.primary : c.text} />
        </g>,
      );
      y += 5.5;
    });
    y += 3.5;
  });
  return (
    <Frame>
      <rect width={W} height={H} fill={c.bg} />
      <rect width={42} height={H} fill={c.side} />
      <rect x={42} width={0.6} height={H} fill={c.border} />
      <rect x={5} y={5} width={5} height={5} rx={1} fill={c.primary} />
      <rect x={12} y={6} width={16} height={3} rx={1} fill={c.ink} />
      {sidebar}

      <rect x={48} y={6} width={30} height={4} rx={0.8} fill={c.ink} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={48 + i * 6.5}
          y={13.5}
          width={4.6}
          height={4.6}
          rx={0.8}
          fill={i === 0 ? c.primary : '#ffffff'}
          stroke={i === 0 ? 'none' : c.border}
          strokeWidth={0.5}
        />
      ))}
      {[22, 47, 72].map((top, row) =>
        columns(6, 48, 155, cardW).map((x, col) => {
          const i = row * 6 + col;
          const badge = c.badges[i];
          return (
            <g key={i}>
              <rect x={x} y={top} width={cardW} height={23} rx={1} fill="#ffffff" stroke={c.border} strokeWidth={0.5} />
              <rect x={x + 1} y={top + 1} width={cardW - 2} height={14} rx={0.6} fill={c.posters[i]} />
              {badge && <rect x={x + 2} y={top + 2} width={7} height={2.6} rx={1.3} fill={badge} />}
              <rect x={x + 1.5} y={top + 17} width={cardW - 4} height={1.6} rx={0.8} fill="#334155" />
              <rect x={x + 1.5} y={top + 20} width={8} height={1.3} rx={0.65} fill={c.faint} />
            </g>
          );
        }),
      )}
    </Frame>
  );
}

// ── Fresh: cinematic dark. A glass top bar with tabs (Home + sections), a
//    warm glow and big image-led posters with their titles on the image. ────

const FRESH = {
  bg: '#09090c',
  amber: '#f8a23a',
  text: '#f5f1ea',
  posters: [
    ['#7c3aed', '#1e1b4b'],
    ['#f59e0b', '#7c2d12'],
    ['#0ea5e9', '#0b1e3a'],
    ['#e11d48', '#3b0a1a'],
  ],
};

function FreshThumbnail() {
  const c = FRESH;
  const id = useSvgId();
  const posterW = 32;
  return (
    <Frame>
      <defs>
        <radialGradient id={id('glow')} cx="0.78" cy="0.05" r="0.75">
          <stop offset="0" stopColor={c.amber} stopOpacity={0.32} />
          <stop offset="1" stopColor={c.amber} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={id('glow2')} cx="0.1" cy="0.2" r="0.6">
          <stop offset="0" stopColor="#7c3aed" stopOpacity={0.22} />
          <stop offset="1" stopColor="#7c3aed" stopOpacity={0} />
        </radialGradient>
        {c.posters.map(([from, to], i) => (
          <linearGradient key={i} id={id(`p${i}`)} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
        <linearGradient id={id('shade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#000000" stopOpacity={0} />
          <stop offset="1" stopColor="#000000" stopOpacity={0.8} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={c.bg} />
      <rect width={W} height={H} fill={`url(#${id('glow')})`} />
      <rect width={W} height={H} fill={`url(#${id('glow2')})`} />

      {/* Glass top bar with scrollable tabs. */}
      <rect x={6} y={5} width={148} height={12} rx={6} fill="#ffffff" fillOpacity={0.07} stroke="#ffffff" strokeOpacity={0.14} strokeWidth={0.5} />
      <circle cx={13} cy={11} r={2.2} fill={c.amber} />
      <rect x={19} y={8} width={17} height={6} rx={3} fill={c.amber} />
      <rect x={22.5} y={10.2} width={10} height={1.6} rx={0.8} fill="#1a1206" />
      {[10, 9, 11, 8, 10, 9].map((w, i) => (
        <rect key={i} x={41 + i * 15} y={10.2} width={w} height={1.6} rx={0.8} fill="#ffffff" fillOpacity={0.55} />
      ))}
      <circle cx={147} cy={11} r={3.2} fill="#3f3f46" stroke={c.amber} strokeOpacity={0.6} strokeWidth={0.5} />

      <rect x={10} y={25} width={48} height={6} rx={1.5} fill={c.text} />
      <rect x={10} y={34} width={30} height={2} rx={1} fill="#ffffff" fillOpacity={0.45} />
      {columns(4, 10, 150, posterW).map((x, i) => (
        <g key={i}>
          <rect x={x} y={42} width={posterW} height={46} rx={4} fill={`url(#${id(`p${i}`)})`} />
          <rect x={x} y={42} width={posterW} height={46} rx={4} fill={`url(#${id('shade')})`} />
          <rect x={x} y={42} width={posterW} height={46} rx={4} fill="none" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={0.5} />
          <rect x={x + 4} y={78} width={i % 2 ? 16 : 20} height={2.2} rx={1.1} fill="#ffffff" />
          <rect x={x + 4} y={82.5} width={10} height={1.6} rx={0.8} fill="#ffffff" fillOpacity={0.6} />
        </g>
      ))}
      {columns(4, 10, 150, posterW).map((x, i) => (
        <rect key={i} x={x} y={93} width={posterW} height={20} rx={4} fill={`url(#${id(`p${(i + 2) % 4}`)})`} opacity={0.7} />
      ))}
    </Frame>
  );
}

const LAYOUT_THUMBNAILS: Record<LayoutId, React.ComponentType> = {
  classic: ClassicThumbnail,
  minimal: MinimalThumbnail,
  organised: OrganisedThumbnail,
  fresh: FreshThumbnail,
};

export function LayoutThumbnail({ layout }: { layout: LayoutId }) {
  const Thumbnail = LAYOUT_THUMBNAILS[layout];
  return <Thumbnail />;
}

// ── Title view: a short popup over the section page, or a full page. In the
//    current theme's colours. ──────────────────────────────────────────────

function PopupThumbnail() {
  return (
    <Frame>
      <rect width={W} height={H} className="fill-background" />
      <rect x={10} y={8} width={34} height={4.5} rx={1} className="fill-foreground/70" />
      {[22, 58].map((y) =>
        columns(5, 10, 150, 24).map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={24} height={32} rx={2} className="fill-muted" />),
      )}
      <rect width={W} height={H} className="fill-black/40" />
      <rect x={38} y={12} width={84} height={76} rx={4} className="fill-popover stroke-border" strokeWidth={0.6} />
      <rect x={44} y={18} width={18} height={26} rx={1.5} className="fill-primary/40" />
      <rect x={66} y={19} width={36} height={4} rx={1} className="fill-foreground" />
      <rect x={66} y={26} width={22} height={2} rx={1} className="fill-muted-foreground/60" />
      {[66, 82, 98].map((x, i) => (
        <rect key={x} x={x} y={33} width={14} height={5} rx={2.5} className={i === 0 ? 'fill-primary' : 'fill-muted'} />
      ))}
      {[50, 55, 60].map((y, i) => (
        <rect key={y} x={44} y={y} width={i === 2 ? 44 : 70} height={2} rx={1} className="fill-muted-foreground/40" />
      ))}
      <rect x={44} y={76} width={18} height={6} rx={1.5} className="fill-muted" />
      <rect x={94} y={76} width={22} height={6} rx={1.5} className="fill-primary" />
    </Frame>
  );
}

function FullPageThumbnail() {
  return (
    <Frame>
      <rect width={W} height={H} className="fill-background" />
      <rect x={10} y={10} width={32} height={46} rx={2} className="fill-primary/40" />
      <rect x={50} y={11} width={56} height={5} rx={1.2} className="fill-foreground" />
      <rect x={50} y={19.5} width={32} height={2} rx={1} className="fill-muted-foreground/60" />
      {[50, 67, 84].map((x, i) => (
        <rect key={x} x={x} y={26} width={15} height={5} rx={2.5} className={i === 0 ? 'fill-primary' : 'fill-muted'} />
      ))}
      {[37, 42, 47].map((y, i) => (
        <rect key={y} x={50} y={y} width={i === 2 ? 60 : 98} height={2} rx={1} className="fill-muted-foreground/40" />
      ))}
      <rect x={10} y={63} width={140} height={0.6} className="fill-border" />
      <rect x={10} y={68} width={16} height={2.4} rx={1} className="fill-foreground/70" />
      {[74, 79, 84, 89].map((y, i) => (
        <rect key={y} x={10} y={y} width={i === 3 ? 40 : 64} height={2} rx={1} className="fill-muted-foreground/40" />
      ))}
      <rect x={84} y={68} width={18} height={2.4} rx={1} className="fill-foreground/70" />
      {[74, 81, 88].map((y) => (
        <g key={y}>
          <circle cx={86} cy={y + 1} r={1.5} className="fill-primary/70" />
          <rect x={91} y={y} width={44} height={2} rx={1} className="fill-muted-foreground/40" />
        </g>
      ))}
    </Frame>
  );
}

export function TitleViewThumbnail({ view }: { view: TitleView }) {
  return view === 'page' ? <FullPageThumbnail /> : <PopupThumbnail />;
}
