import { motion } from 'framer-motion'
import { Database, Key, Terminal, CheckCircle2, ExternalLink, Copy, Check } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { useState } from 'react'
import { copyToClipboard } from '@/utils/formatters'

const steps = [
  {
    icon: Database,
    title: 'Criar projeto no Supabase',
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
    desc: 'Acesse supabase.com, crie um novo projeto e copie a URL e a Anon Key nas configurações do projeto.',
    link: { label: 'Abrir Supabase', href: 'https://supabase.com/dashboard' },
  },
  {
    icon: Terminal,
    title: 'Executar o SQL do banco',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    desc: 'No Supabase, vá em SQL Editor e execute o conteúdo do arquivo supabase/migrations/001_initial.sql.',
    code: 'supabase/migrations/001_initial.sql',
  },
  {
    icon: Key,
    title: 'Criar o arquivo .env',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
    desc: 'Na pasta do projeto, crie um arquivo .env com as variáveis abaixo:',
    code: `VITE_SUPABASE_URL=https://seu-projeto.supabase.co\nVITE_SUPABASE_ANON_KEY=sua-chave-anon`,
  },
  {
    icon: Terminal,
    title: 'Reiniciar o servidor',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
    desc: 'Após criar o .env, pare o servidor (Ctrl+C) e execute novamente:',
    code: 'npm run dev',
  },
]

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative mt-2">
      <pre className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">{code}</pre>
      <button
        onClick={async () => { await copyToClipboard(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  )
}

export function Setup() {
  return (
    <div className="min-h-screen bg-[#0a0c11] flex items-center justify-center p-4">
      {/* Background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-blue-600/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-purple-600/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 1, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl relative"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <BrandMark size={64} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">StatusMedia</h1>
          <p className="text-gray-400">Configure o sistema em 4 passos simples</p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 1, x: 0 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 + 0.2 }}
              className={`rounded-xl border ${step.bg} p-5`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-400">
                    {i + 1}
                  </div>
                  <step.icon className={`w-5 h-5 ${step.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-400">{step.desc}</p>
                  {step.code && <CodeBlock code={step.code} />}
                  {step.link && (
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {step.link.label} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer note */}
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 p-4 rounded-xl border border-white/8 bg-white/3 flex items-start gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white font-medium">Tudo pronto após a configuração</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Após preencher o .env e reiniciar, você terá acesso completo ao sistema com 48 agentes de IA, gestão de clientes ilimitados e geração de conteúdo estratégico.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
