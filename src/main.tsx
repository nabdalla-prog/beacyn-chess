import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/lexend/latin-400.css'
import '@fontsource/lexend/latin-600.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline play and "install app": registered after the page has loaded, so it never slows the first visit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
