// Shared keyframes + reduced-motion guard for the Databricks pages.
// Render once per page (styled-jsx-less inline <style>, matching the app's existing pattern).
export default function GlobalStyles() {
  return (
    <style>{`
      @keyframes db-spin { to { transform: rotate(360deg); } }
      @keyframes db-fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes db-rise-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

      .db-row { transition: background 120ms ease; }
      .db-row:hover { background: rgba(24,24,27,0.035); }
      .db-row-clickable { cursor: pointer; }

      .db-btn[data-variant="primary"]:hover:not(:disabled) { background: #E62E1B; }
      .db-btn[data-variant="secondary"]:hover:not(:disabled) { border-color: #D4D4D8; background: #F4F4F5; }
      .db-btn[data-variant="ghost"]:hover:not(:disabled) { background: rgba(24,24,27,0.045); color: #18181B; }
      .db-btn:active:not(:disabled) { transform: scale(0.98); }

      .db-list-row:hover { background: #FAFAFA; }

      @media (prefers-reduced-motion: reduce) {
        .db-scope *, .db-scope *::before, .db-scope *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    `}</style>
  )
}
