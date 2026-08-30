import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const cookieTheme = document.cookie.match(/(?:^|; )rms_theme=(dark|light)(?:;|$)/)?.[1]
const savedTheme = cookieTheme || localStorage.getItem('theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.classList.toggle('dark', savedTheme === 'dark' || (!savedTheme && prefersDark))
if (cookieTheme) localStorage.setItem('theme', cookieTheme)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((error) => {
    console.error('PWA registration failed:', error)
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
