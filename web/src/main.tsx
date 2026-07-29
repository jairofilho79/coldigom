import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'

// Preview deployments (*.coldigom-web.pages.dev) are not registered in Google OAuth.
if (import.meta.env.PROD) {
  const { hostname, pathname, search, hash } = window.location;
  if (hostname.endsWith('.coldigom-web.pages.dev') && hostname !== 'coldigom-web.pages.dev') {
    window.location.replace(`https://coldigom-web.pages.dev${pathname}${search}${hash}`);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
