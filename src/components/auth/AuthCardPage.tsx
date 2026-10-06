import { motion } from 'framer-motion'
import { BrandMark } from '@/components/BrandMark'

/**
 * Moldura das telas de autenticação de um cartão só (esqueci a senha, criar ou
 * redefinir senha). Mesmo visual do Login: fundo claro, cartão branco, o
 * símbolo da StatusMedia e o botão azul-marinho de AuthButton. Antes essas
 * telas eram escuras, com um raio roxo, e não pareciam ser da StatusMedia.
 */
export function AuthCardPage({ title, subtitle, children, footer }: {
  title: string
  subtitle?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#f4f4f8] flex flex-col items-center justify-center p-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="bg-white rounded-2xl border border-[#e8e8e8] shadow-sm p-6">
          <div className="flex justify-center mb-1">
            <BrandMark size={64} />
          </div>
          <div className="mb-5">
            <h1 className="text-[22px] font-bold text-[#0f0f0f]">{title}</h1>
            {subtitle && <p className="text-[13px] text-[#6b7280] mt-1 leading-relaxed">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer}
        <p className="text-center text-[11px] text-[#a0a0a0] mt-3">
          © {new Date().getFullYear()} StatusMedia. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  )
}

/** Botão principal das telas de autenticação (o mesmo do Login). */
export function AuthButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full h-11 rounded-xl text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-[#29457a]/25"
      style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)' }}
    >
      {children}
    </button>
  )
}
