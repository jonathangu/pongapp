import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/app.css'

const root = document.getElementById('root')
if (!root) throw new Error('PongApp root element is missing.')

createRoot(root).render(<App />)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  })
}
