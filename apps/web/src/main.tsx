import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/app.css'
import './styles/expedition.css'
import './styles/crew.css'

const root = document.getElementById('root')
if (!root) throw new Error('PongApp root element is missing.')

createRoot(root).render(<App />)
