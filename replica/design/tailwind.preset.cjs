// Mapa de tokens a Tailwind. Los componentes usan bg-surface text-muted, nunca hex.
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'bg': 'var(--c-bg)',
        'surface': 'var(--c-surface)',
        'surface-2': 'var(--c-surface-2)',
        'border': 'var(--c-border)',
        'border-input': 'var(--c-border-input)',
        'text': 'var(--c-text)',
        'text-muted': 'var(--c-text-muted)',
        'accent': 'var(--c-accent)',
        'on-accent': 'var(--c-on-accent)',
        'danger': 'var(--c-danger)',
        'success': 'var(--c-success)',
        'warning': 'var(--c-warning)',
        'income': 'var(--c-income)',
        'expense': 'var(--c-expense)'
      },
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
      fontSize: {
        'caption': ['var(--t-caption-size)', { lineHeight: 'var(--t-caption-line)', fontWeight: 'var(--t-caption-weight)' }],
        'footnote': ['var(--t-footnote-size)', { lineHeight: 'var(--t-footnote-line)', fontWeight: 'var(--t-footnote-weight)' }],
        'body': ['var(--t-body-size)', { lineHeight: 'var(--t-body-line)', fontWeight: 'var(--t-body-weight)' }],
        'headline': ['var(--t-headline-size)', { lineHeight: 'var(--t-headline-line)', fontWeight: 'var(--t-headline-weight)' }],
        'title': ['var(--t-title-size)', { lineHeight: 'var(--t-title-line)', fontWeight: 'var(--t-title-weight)' }],
        'large-title': ['var(--t-large-title-size)', { lineHeight: 'var(--t-large-title-line)', fontWeight: 'var(--t-large-title-weight)' }],
        'balance': ['var(--t-balance-size)', { lineHeight: 'var(--t-balance-line)', fontWeight: 'var(--t-balance-weight)' }]
      },
      borderRadius: {
        'sm': 'var(--r-sm)',
        'md': 'var(--r-md)',
        'lg': 'var(--r-lg)',
        'pill': 'var(--r-pill)'
      },
      boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)' },
      minHeight: { tap: 'var(--min-tap)' }
    }
  }
};
