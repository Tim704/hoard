import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

import { LAYOUT_IDS } from './src/lib/layouts';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    // Status and category colour maps live in lib/ — without this they are
    // never compiled and every status renders uncoloured.
    './src/lib/**/*.{ts,tsx}',
    './src/hooks/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          // --card-alpha: Fresh's glass cards (globals.css), 1 elsewhere. It
          // multiplies with an opacity modifier, so bg-card/40 still works.
          DEFAULT: 'hsl(var(--card) / calc(var(--card-alpha, 1) * <alpha-value>))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        // The layout's display face (globals.css): the sans stack in Classic.
        display: 'var(--font-display)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    // `classic:` / `minimal:` / `organised:` / `fresh:` style an element for
    // one layout (<html data-layout>, src/lib/layouts.ts), without JS branches.
    // `:root` lifts them to (0,3,0), above `dark:` (0,2,0), so `fresh:x` wins
    // over a `dark:x` on the same element; `fresh:dark:x` also works.
    plugin(({ addVariant }) => {
      for (const id of LAYOUT_IDS) addVariant(id, `:is(:root[data-layout="${id}"] &)`);
    }),
  ],
};

export default config;
