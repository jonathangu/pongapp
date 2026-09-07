import { createRoot } from 'react-dom/client'
import App from './PuzzleApp'

const root = document.getElementById('root')
if (!root) throw new Error('PongApp root element is missing.')

createRoot(root).render(<App />)
