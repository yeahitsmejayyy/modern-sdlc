import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The same build runs in staging and production, so the environment is decided
// here, where the code runs, rather than baked in at build time.
if (location.hostname.includes('staging')) document.title += ' - staging'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
