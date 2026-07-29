// Shared keyframes, hover states, and reduced-motion guard for the Databricks pages.
// Render once per page (inline <style>, matching the app's existing pattern).
export default function GlobalStyles() {
  return (
    <style>{`
      @keyframes db-spin { to { transform: rotate(360deg); } }
      @keyframes db-fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes db-rise-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes db-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

      .db-row { transition: background 120ms ease; }
      .db-row:hover { background: rgba(77,168,160,0.06); }
      .db-row-clickable { cursor: pointer; }

      .db-btn[data-variant="primary"]:hover:not(:disabled) { background: #185750; transform: translateY(-1px); }
      .db-btn[data-variant="secondary"]:hover:not(:disabled) { border-color: #93CCC6; background: #F0FAFA; }
      .db-btn[data-variant="ghost"]:hover:not(:disabled) { background: rgba(13,17,23,0.05); color: #0D1117; }
      .db-btn:active:not(:disabled) { transform: scale(0.98); }

      .db-list-row { position: relative; }
      .db-list-row:hover { background: #F0FAFA; }
      .db-row-chevron { transition: transform 160ms cubic-bezier(0.25,1,0.5,1), color 160ms ease; }
      .db-list-row:hover .db-row-chevron { transform: translateX(3px); color: #4DA8A0; }

      /* Shimmer sheen for live progress fills (Skiper UI-style skeleton shimmer) */
      .db-shimmer { position: relative; overflow: hidden; }
      .db-shimmer::after {
        content: ''; position: absolute; inset: 0; transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
        animation: db-shimmer 1.6s ease-in-out infinite;
      }

      /* Cursor-tracked spotlight on section containers
         (pattern adapted from Vengeance UI's spotlight-border cards, toned down) */
      .db-spot-host { position: relative; }
      .db-spot {
        position: absolute; inset: 0; pointer-events: none; opacity: 0; border-radius: inherit;
        transition: opacity 240ms ease;
        background: radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(108,189,181,0.10), transparent 65%);
      }
      .db-spot-host:hover .db-spot { opacity: 1; }

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
