import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { environment } from './environment.ts'

if (environment === 'staging') document.title += ' - staging'

const root = createRoot(document.getElementById('root')!)

// Dev only: #agent-preview shows every state of the agent widget. The whole branch
// is dropped from production builds.
if (import.meta.env.DEV && location.hash === '#agent-preview') {
  import('./agent-preview.tsx').then(({ AgentPreview }) =>
    root.render(
      <StrictMode>
        <AgentPreview />
      </StrictMode>,
    ),
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
