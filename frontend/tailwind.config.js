/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // All colours are CSS variables (see index.css) so the "night desk" theme can swap them.
        desk: { DEFAULT: 'rgb(var(--c-desk) / <alpha-value>)', deep: 'rgb(var(--c-desk-deep) / <alpha-value>)', edge: 'rgb(var(--c-desk-edge) / <alpha-value>)' },
        paper: { DEFAULT: 'rgb(var(--c-paper) / <alpha-value>)', warm: 'rgb(var(--c-paper-warm) / <alpha-value>)', rule: 'rgb(var(--c-paper-rule) / <alpha-value>)' },
        ink: { DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)', soft: 'rgb(var(--c-ink-soft) / <alpha-value>)', mute: 'rgb(var(--c-ink-mute) / <alpha-value>)', faint: 'rgb(var(--c-ink-faint) / <alpha-value>)' },
        inkbg: 'rgb(var(--c-inkbg) / <alpha-value>)',
        onink: 'rgb(var(--c-onink) / <alpha-value>)',
        manila: { DEFAULT: 'rgb(var(--c-manila) / <alpha-value>)', light: 'rgb(var(--c-manila-light) / <alpha-value>)', dark: 'rgb(var(--c-manila-dark) / <alpha-value>)', shade: 'rgb(var(--c-manila-shade) / <alpha-value>)' },
        stamp: { DEFAULT: 'rgb(var(--c-stamp) / <alpha-value>)', deep: 'rgb(var(--c-stamp-deep) / <alpha-value>)', wash: 'rgb(var(--c-stamp-wash) / <alpha-value>)' },
        ledger: { DEFAULT: 'rgb(var(--c-ledger) / <alpha-value>)', deep: 'rgb(var(--c-ledger-deep) / <alpha-value>)', wash: 'rgb(var(--c-ledger-wash) / <alpha-value>)' },
        carbon: { DEFAULT: 'rgb(var(--c-carbon) / <alpha-value>)', wash: 'rgb(221 225 243 / <alpha-value>)' },
        marker: '#F4DF4E',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        hand: ['Caveat', 'Segoe Script', 'cursive'],
      },
      boxShadow: {
        sheet: '0 1px 0 rgba(21,18,14,.06), 0 12px 24px -12px rgba(60,42,12,.28), 0 32px 60px -30px rgba(60,42,12,.35)',
        lift: '0 2px 0 rgba(21,18,14,.05), 0 24px 40px -18px rgba(60,42,12,.4)',
        inset: 'inset 0 1px 0 rgba(255,255,255,.55), inset 0 -1px 0 rgba(21,18,14,.08)',
      },
      transitionTimingFunction: {
        paper: 'cubic-bezier(.22,1,.36,1)',
        snap: 'cubic-bezier(.65,0,.35,1)',
      },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        blink: { '0%,100%': { opacity: 1 }, '50%': { opacity: .25 } },
        draw: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        marquee: 'marquee 38s linear infinite',
        blink: 'blink 1.4s steps(2, jump-none) infinite',
        draw: 'draw .7s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
}
