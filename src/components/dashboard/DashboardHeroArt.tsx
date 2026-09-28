'use client'
import { motion } from 'framer-motion'

// ── Ilustração SVG premium ────────────────────────────────────────────────────

export function DashboardHeroArt({ dark = false }: { dark?: boolean }) {
  // No modo dark, o glow ambiente fica mais intenso para contrastar com o fundo escuro
  const glowOpacity = dark ? '0.42' : '0.13'
  const mugShadowOpacity = dark ? '0.34' : '0.12'

  // Silhueta da xícara (reutilizada p/ corpo, sombreado interno e contorno)
  const bodyPath =
    'M90 91 C90 75 100 69 114 69 L138 69 C152 69 162 75 162 91 ' +
    'L158 179 C158 187 152 191 140 191 L112 191 C100 191 94 187 94 179 Z'

  return (
    <svg
      viewBox="0 0 320 228"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      aria-hidden="true"
    >
      <defs>
        {/* Mug: cilindro cerâmico — borda esquerda em sombra, faixa de luz, lado direito em sombra */}
        <linearGradient id="art_mug" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#d4d9e3" />
          <stop offset="15%"  stopColor="#ffffff" />
          <stop offset="44%"  stopColor="#f1f4f8" />
          <stop offset="73%"  stopColor="#d8dde7" />
          <stop offset="100%" stopColor="#bfc6d3" />
        </linearGradient>

        {/* Sombreamento vertical (oclusão de ambiente na base) */}
        <linearGradient id="art_mug_ao" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0" />
          <stop offset="60%"  stopColor="#9aa3b5" stopOpacity="0" />
          <stop offset="100%" stopColor="#6f7890" stopOpacity="0.32" />
        </linearGradient>

        {/* Borda / lábio cerâmico do topo */}
        <linearGradient id="art_rim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="55%"  stopColor="#eef1f6" />
          <stop offset="100%" stopColor="#cfd5e0" />
        </linearGradient>

        {/* Superfície do café — radial, mais escuro ao centro */}
        <radialGradient id="art_coffee" cx="42%" cy="38%" r="70%">
          <stop offset="0%"   stopColor="#3c2110" />
          <stop offset="55%"  stopColor="#26140a" />
          <stop offset="100%" stopColor="#150c05" />
        </radialGradient>

        {/* Disco azul — face superior */}
        <linearGradient id="art_disc" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Disco azul — glow ao redor */}
        <radialGradient id="art_disc_glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#2563eb" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </radialGradient>

        {/* Plant pot */}
        <linearGradient id="art_pot" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e7edf5" />
        </linearGradient>

        {/* Ambient glow */}
        <radialGradient id="art_ambient" cx="40%" cy="65%" r="52%">
          <stop offset="0%"   stopColor="#2563eb" stopOpacity={glowOpacity} />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0"           />
        </radialGradient>

        {/* Mug drop shadow (neutro, aterra na pires) */}
        <filter id="art_mug_f" x="-22%" y="-12%" width="144%" height="144%">
          <feDropShadow dx="0" dy="11" stdDeviation="13"
            floodColor="#04070f" floodOpacity={mugShadowOpacity} />
        </filter>

        {/* Saucer shadow */}
        <filter id="art_sau_f" x="-20%" y="-60%" width="140%" height="200%">
          <feDropShadow dx="0" dy="5" stdDeviation="7"
            floodColor="#000" floodOpacity="0.07" />
        </filter>

        {/* Plant shadow */}
        <filter id="art_plt_f" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="8"
            floodColor="#1d4ed8" floodOpacity="0.08" />
        </filter>

        {/* Blurs suaves p/ brilho/sombra do cilindro e vapor */}
        <filter id="art_blur_m" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="art_blur_s" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>

        {/* Recorte na silhueta da xícara p/ conter brilho e sombra internos */}
        <clipPath id="art_mug_clip">
          <path d={bodyPath} />
        </clipPath>
      </defs>

      {/* ── Ambient glow ── */}
      <ellipse cx="155" cy="158" rx="148" ry="72" fill="url(#art_ambient)" />

      {/* ── Ground shadow ── */}
      <ellipse cx="126" cy="208" rx="90" ry="8" fill="#00000008" />

      {/* ═══════════════════ DISCO AZUL ═══════════════════ */}

      {/* Glow azul ao redor do disco */}
      <ellipse cx="126" cy="196" rx="98" ry="24" fill="url(#art_disc_glow)" />

      {/* Profundidade / lateral */}
      <ellipse cx="126" cy="199" rx="74" ry="13"
        fill="#1e40af"
        filter="url(#art_sau_f)"
      />

      {/* Face superior */}
      <ellipse cx="126" cy="193" rx="74" ry="12"
        fill="url(#art_disc)"
      />

      {/* Brilho superior */}
      <ellipse cx="110" cy="190" rx="30" ry="4.5" fill="#93c5fd" opacity="0.55" filter="url(#art_blur_s)" />

      {/* Aro interno */}
      <ellipse cx="126" cy="192" rx="44" ry="7.5"
        fill="none" stroke="#1e3a8a" strokeWidth="1" opacity="0.45" />

      {/* Sombra de contato da xícara sobre o disco */}
      <ellipse cx="126" cy="190" rx="35" ry="6.5"
        fill="#0a1f5c" opacity="0.30" filter="url(#art_blur_s)" />

      {/* ═══════════════════ MUG ═══════════════════ */}

      {/* Asa (atrás do corpo, p/ profundidade) */}
      <path d="M161 101 C199 101 199 161 161 161"
        stroke="#aeb6c4" strokeWidth="17" strokeLinecap="round" fill="none" />
      <path d="M162 102 C195 103 195 159 162 160"
        stroke="#edf1f7" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M163 104 C191 105 191 156 163 158"
        stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M168 118 C186 122 186 140 168 144"
        stroke="#9aa3b4" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.45" />

      {/* Corpo */}
      <path d={bodyPath} fill="url(#art_mug)" filter="url(#art_mug_f)" />

      {/* Sombreamento do cilindro (contido na silhueta) */}
      <g clipPath="url(#art_mug_clip)">
        {/* sombra do lado direito */}
        <ellipse cx="150" cy="134" rx="8" ry="48"
          fill="#828ba0" opacity="0.34" filter="url(#art_blur_m)" />
        {/* oclusão na base */}
        <path d={bodyPath} fill="url(#art_mug_ao)" />
        {/* brilho cerâmico (faixa de luz à esquerda) */}
        <ellipse cx="109" cy="128" rx="6.5" ry="45"
          fill="#ffffff" opacity="0.55" filter="url(#art_blur_m)" />
        {/* reflexo especular curto, mais nítido */}
        <ellipse cx="106" cy="104" rx="3" ry="15"
          fill="#ffffff" opacity="0.7" filter="url(#art_blur_s)" />
      </g>

      {/* Contorno sutil */}
      <path d={bodyPath} fill="none" stroke="#c5cdda" strokeWidth="1" opacity="0.55" />

      {/* ── Borda + interior ── */}
      {/* lábio externo cerâmico */}
      <ellipse cx="126" cy="80" rx="34" ry="11.5" fill="url(#art_rim)" />
      {/* parede interna (sombra) */}
      <ellipse cx="126" cy="80.5" rx="30" ry="9.8" fill="#cdd4df" />
      {/* sombra projetada da parede frontal dentro da xícara */}
      <ellipse cx="126" cy="79.4" rx="30" ry="9.8" fill="#aab2c1" opacity="0.45" />

      {/* Café */}
      <ellipse cx="126" cy="81.2" rx="28" ry="8.8" fill="url(#art_coffee)" />
      {/* anel de crema */}
      <ellipse cx="126" cy="81.2" rx="28" ry="8.8"
        fill="none" stroke="#714529" strokeWidth="1.6" opacity="0.5" />
      {/* reflexo quente na superfície */}
      <ellipse cx="117" cy="79.2" rx="8" ry="2.4" fill="#9c6a3e" opacity="0.3" />
      <ellipse cx="114" cy="78.4" rx="2.4" ry="0.9" fill="#cf975c" opacity="0.55" />

      {/* ── Face ── */}
      <circle cx="112" cy="128" r="4"   fill="#2b1a0f" />
      <circle cx="113.5" cy="126.4" r="1.2" fill="white" />
      <circle cx="140" cy="128" r="4"   fill="#2b1a0f" />
      <circle cx="141.5" cy="126.4" r="1.2" fill="white" />
      <path
        d="M112 143 Q126 153 140 143"
        fill="none" stroke="#2b1a0f"
        strokeWidth="2.5" strokeLinecap="round"
      />

      {/* ── Steam (vapor suave) ── */}
      <motion.path
        d="M110 63 C108 52 115 44 111 33"
        stroke="#eaf1f8" strokeWidth="2.6" strokeLinecap="round"
        filter="url(#art_blur_s)"
        animate={{ y: [0, -7, 0], opacity: [0.5, 0.14, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path
        d="M126 59 C124 48 131 40 127 29"
        stroke="#eaf1f8" strokeWidth="2.3" strokeLinecap="round"
        filter="url(#art_blur_s)"
        animate={{ y: [0, -8, 0], opacity: [0.42, 0.1, 0.42] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
      />
      <motion.path
        d="M142 62 C140 51 147 43 143 32"
        stroke="#eaf1f8" strokeWidth="1.9" strokeLinecap="round"
        filter="url(#art_blur_s)"
        animate={{ y: [0, -6, 0], opacity: [0.3, 0.07, 0.3] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}
      />

      {/* ═══════════════════ PLANT ═══════════════════ */}

      {/* Ground shadow */}
      <ellipse cx="258" cy="208" rx="30" ry="5.5" fill="#00000009" />

      {/* Pot body */}
      <path
        d="M234 165 L239 197 L277 197 L282 165 Z"
        fill="url(#art_pot)"
        filter="url(#art_plt_f)"
      />
      <path
        d="M234 165 L239 197 L277 197 L282 165 Z"
        fill="none" stroke="#e0d8f5" strokeWidth="0.8"
      />

      {/* Pot rim */}
      <rect x="231" y="158" width="54" height="10" rx="5" fill="#f3eeff" />
      <rect x="231" y="158" width="54" height="10" rx="5"
        fill="none" stroke="#e0d8f5" strokeWidth="0.8" />

      {/* Soil */}
      <ellipse cx="258" cy="164" rx="22" ry="4" fill="#5a3820" opacity="0.3" />

      {/* Leaf 1 — arching left */}
      <path
        d="M256 158 C240 139 228 117 234 95
           C240 113 250 137 258 158 Z"
        fill="#2db554" opacity="0.85"
      />
      <path d="M256 158 C240 139 228 117 234 95"
        fill="none" stroke="#1a8c38" strokeWidth="1.3"
        strokeLinecap="round" opacity="0.58"
      />

      {/* Leaf 2 — center upright */}
      <path
        d="M258 155 C255 133 263 112 259 89
           C254 113 252 135 258 155 Z"
        fill="#25c44a"
      />
      <path d="M258 155 C255 133 263 112 259 89"
        fill="none" stroke="#15943a" strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* Leaf 3 — arching right */}
      <path
        d="M260 158 C274 139 284 119 278 97
           C272 117 264 139 260 158 Z"
        fill="#2db554" opacity="0.88"
      />
      <path d="M260 158 C274 139 284 119 278 97"
        fill="none" stroke="#1a8c38" strokeWidth="1.3"
        strokeLinecap="round" opacity="0.58"
      />

      {/* Leaf 4 — background left */}
      <path
        d="M255 151 C244 133 236 113 240 93
           C246 111 254 131 257 151 Z"
        fill="#5de07a" opacity="0.48"
      />

      {/* ═══════════════════ SPARKLES & DOTS ═══════════════════ */}

      {/* Top-right star */}
      <motion.g
        style={{ transformOrigin: '275px 30px' }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.72, 0.32, 0.72] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M275 20 L277 27 L284 29 L277 31 L275 38 L273 31 L266 29 L273 27 Z"
          fill="#93c5fd" opacity="0.82"
        />
      </motion.g>

      {/* Small star */}
      <path
        d="M290 61 L291.2 65 L295.5 66.2 L291.2 67.4 L290 71.4
           L288.8 67.4 L284.5 66.2 L288.8 65 Z"
        fill="#bfdbfe" opacity="0.52"
      />

      {/* Left floating dots */}
      <motion.circle cx="30" cy="70" r="5"
        fill="#dbeafe" opacity="0.62"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle cx="22" cy="130" r="2.8"
        fill="#93c5fd" opacity="0.38"
        animate={{ y: [0, 5, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.9 }}
      />
      <circle cx="24" cy="170" r="2"   fill="#bfdbfe" opacity="0.28" />

      {/* Right dots */}
      <circle cx="298" cy="98"  r="3" fill="#bfdbfe" opacity="0.42" />
      <circle cx="302" cy="158" r="2" fill="#93c5fd" opacity="0.28" />
    </svg>
  )
}
