import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { initReviewLocale } from './lib/reviewLocale'

Sentry.init({
  dsn: 'https://38594d8cc1cbe9ba9d676377fdf62010@o4511718172590080.ingest.us.sentry.io/4511718220365824',
  sendDefaultPii: false,
})

// Recarrega a página automaticamente quando um chunk lazy-loaded não existe
// mais (usuário com a aba aberta desde antes do último deploy, tentando
// carregar um asset com hash antigo). Um reload busca o index.html fresco,
// que aponta pros hashes novos. Guard evita loop infinito caso o reload
// também falhe (ex: deploy realmente quebrado).
window.addEventListener('vite:preloadError', () => {
  const key = 'sm_chunk_reload_attempted'
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  window.location.reload()
})

// Patch: Google Translate injects <font> elements into text nodes, causing
// React's removeChild/insertBefore to fail when it can't find the original node.
// This silently ignores those mismatched operations instead of crashing React.
;(function patchForGoogleTranslate() {
  const { removeChild, insertBefore } = Node.prototype
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) return child
    return removeChild.call(this, child) as T
  }
  Node.prototype.insertBefore = function <T extends Node>(node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return node
    return insertBefore.call(this, node, ref) as T
  }
})()

// Interface em inglês para o App Review da Meta (?lang=en). Desligado por padrão.
initReviewLocale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
