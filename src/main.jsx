import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Landing from './Landing.jsx'
import { StoreProvider } from './store.jsx'
import { checkAuth, logout as apiLogout, setUnauthorizedHandler } from './utils/api.js'
import './index.css'

// Auth gate. The data store (and the whole app) mount ONLY after a valid session token exists, so
// there is never an unauthenticated call to the API. An expired token (any 401 mid-session) drops
// straight back to the login screen.
function Root() {
  const [authed, setAuthed] = useState(null) // null = still checking on boot

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false))
    let cancelled = false
    ;(async () => {
      const ok = await checkAuth()
      if (!cancelled) setAuthed(ok)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (authed === null) return null // brief token check — avoids flashing the login screen
  if (!authed) return <Landing onEnter={() => setAuthed(true)} />

  return (
    <StoreProvider>
      <App
        onLogout={() => {
          apiLogout()
          setAuthed(false)
        }}
      />
    </StoreProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
