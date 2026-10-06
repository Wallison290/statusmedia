// Símbolo da StatusMedia (o anel azul), o mesmo do favicon e do login.
// Use este componente sempre que uma tela precisar da marca — antes cada tela
// desenhava o próprio ícone (um raio roxo genérico) e a marca se perdia.

export function BrandMark({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <picture>
      <source srcSet="/logo-icon.avif" type="image/avif" />
      <source srcSet="/logo-icon.webp" type="image/webp" />
      <img
        src="/logo-icon.png"
        alt="StatusMedia"
        width={size}
        height={size}
        className={`object-contain select-none ${className}`}
        style={{ width: size, height: size }}
        draggable={false}
      />
    </picture>
  )
}
