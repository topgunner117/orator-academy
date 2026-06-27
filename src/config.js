// Base URL for the backend API.
// - Production build (the backend serves the built frontend on the SAME domain): use '' so
//   fetch('/api/...') hits the same origin — no configuration needed when deployed as one service.
// - Local dev (frontend on :5180, backend on :8787): default to the local backend.
// - Override anytime with VITE_API_BASE (e.g. if you host the backend on a separate domain).
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? '' : 'http://localhost:8787')
