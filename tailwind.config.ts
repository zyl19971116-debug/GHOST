import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem', xl: '2.5rem', '2xl': '3rem' },
      screens: { '2xl': '1600px' },
    },
    extend: {
      colors: {
        // Core palette taken from the GHOST PROTOCOL AI visual reference.
        void: '#050913',
        abyss: '#03060D',
        panel: '#0A1120',
        ice: '#8DBEFF',
        violet: '#827CFF',
        ghost: '#F2F6FF',
        muted: '#8A9AB8',
        // semantic aliases used by shadcn-style primitives
        border: 'rgba(141, 190, 255, 0.14)',
        input: 'rgba(141, 190, 255, 0.12)',
        ring: '#8DBEFF',
        background: '#050913',
        foreground: '#F2F6FF',
        primary: { DEFAULT: '#8DBEFF', foreground: '#050913' },
        secondary: { DEFAULT: '#827CFF', foreground: '#050913' },
        destructive: { DEFAULT: '#FF5C7A', foreground: '#050913' },
        accent: { DEFAULT: 'rgba(141,190,255,0.10)', foreground: '#F2F6FF' },
        card: { DEFAULT: 'rgba(10, 17, 32, 0.72)', foreground: '#F2F6FF' },
        popover: { DEFAULT: '#0A1120', foreground: '#F2F6FF' },
        muted_ui: '#8A9AB8',
        // status colours (Chinese market convention is applied in charts, not here)
        signal: { ok: '#4ADE80', warn: '#FBBF24', bad: '#FF5C7A', info: '#8DBEFF' },
      },
      fontFamily: {
        display: [
          'var(--font-display)',
          'Rajdhani',
          'Eurostile',
          'Bahnschrift',
          'Impact',
          'Haettenschweiler',
          '"Arial Narrow Bold"',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          'var(--font-sans)',
          'Inter',
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          '"JetBrains Mono"',
          '"Cascadia Mono"',
          'Consolas',
          '"SF Mono"',
          'ui-monospace',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        hud: '0.22em',
        wide2: '0.16em',
      },
      backgroundImage: {
        'hud-grid':
          'linear-gradient(to right, rgba(141,190,255,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(141,190,255,0.055) 1px, transparent 1px)',
        'hud-grid-fine':
          'linear-gradient(to right, rgba(141,190,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(141,190,255,0.035) 1px, transparent 1px)',
        'ice-glow': 'radial-gradient(circle at 50% 50%, rgba(141,190,255,0.30) 0%, rgba(130,124,255,0.12) 45%, transparent 72%)',
        'panel-sheen':
          'linear-gradient(135deg, rgba(141,190,255,0.10) 0%, rgba(141,190,255,0.02) 38%, rgba(130,124,255,0.06) 100%)',
      },
      boxShadow: {
        hud: '0 0 0 1px rgba(141,190,255,0.10), 0 18px 60px -22px rgba(0,0,0,0.95)',
        'ice-sm': '0 0 18px -2px rgba(141,190,255,0.45)',
        'ice-md': '0 0 42px -6px rgba(141,190,255,0.50)',
        'violet-md': '0 0 46px -8px rgba(130,124,255,0.55)',
        inset: 'inset 0 1px 0 0 rgba(242,246,255,0.06)',
      },
      keyframes: {
        'scan-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '12%': { opacity: '0.85' },
          '88%': { opacity: '0.85' },
          '100%': { transform: 'translateY(100%)', opacity: '0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.72)', opacity: '0.75' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'sweep-x': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(320%)' },
        },
        'dash-flow': {
          to: { strokeDashoffset: '-64' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '47%': { opacity: '1' },
          '48%': { opacity: '0.45' },
          '49%': { opacity: '1' },
          '71%': { opacity: '1' },
          '72%': { opacity: '0.6' },
          '73%': { opacity: '1' },
        },
      },
      animation: {
        'scan-down': 'scan-down 7s linear infinite',
        'pulse-ring': 'pulse-ring 3.2s cubic-bezier(0.22,0.61,0.36,1) infinite',
        'pulse-soft': 'pulse-soft 2.8s ease-in-out infinite',
        'sweep-x': 'sweep-x 2.6s ease-in-out infinite',
        'dash-flow': 'dash-flow 1.6s linear infinite',
        float: 'float 6s ease-in-out infinite',
        flicker: 'flicker 6s steps(1, end) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
