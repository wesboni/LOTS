import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// -----------------------------------------------------------------------------
// Application Entry Point
// Renders the root React component into the DOM.
// -----------------------------------------------------------------------------
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* StrictMode activates checks and warnings for child components during development. */}
    <App />
  </StrictMode>,
)
