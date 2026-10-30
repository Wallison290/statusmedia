// Fundo com profundidade atrás do Dashboard em vidro: brilhos azul-marinho e o
// anel da marca grande, que o painel desfoca por cima. Estilos em index.css.
export function GlassBackdrop() {
  return (
    <div aria-hidden className="sm-glass-backdrop absolute inset-0 overflow-hidden pointer-events-none">
      <div className="sm-glass-orb sm-glass-orb-a" />
      <div className="sm-glass-orb sm-glass-orb-b" />
      <div className="sm-glass-orb sm-glass-orb-c" />
      <img src="/logo-icon.png" alt="" draggable={false} className="sm-glass-ring-sm" />
      <img src="/logo-icon.png" alt="" draggable={false} className="sm-glass-ring" />
    </div>
  )
}
