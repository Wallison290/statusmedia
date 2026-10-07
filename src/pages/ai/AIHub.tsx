// ── StatusIA — ecossistema: escolha o squad antes de entrar no chat ───────────
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Wand2 } from 'lucide-react'
import { AI_SQUADS } from '@/data/aiSquads'

export function AIHub() {
  const navigate = useNavigate()

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
      <div className="text-center mb-8">
        <h1 className="text-[24px] font-bold text-[#0f0f0f] mb-2">Como posso ajudar?</h1>
        <p className="text-[13px] text-[#666]">Escolha uma especialidade da StatusIA ou comece uma conversa livre.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Chat livre */}
        <button
          onClick={() => navigate('/ai/livre')}
          className="flex flex-col items-start gap-2 p-4 rounded-2xl border border-[#e0e0e0] bg-white hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-[#16284d] flex items-center justify-center">
            <MessageSquare className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-[13px] font-semibold text-[#0f0f0f]">Chat livre</span>
          <span className="text-[11px] text-[#888] line-clamp-2">Converse sem ativar um squad específico</span>
        </button>

        {/* Criação de imagens — destaque */}
        <button
          onClick={() => navigate('/ai/imagem')}
          className="flex flex-col items-start gap-2 p-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
            <Wand2 className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-[13px] font-semibold text-violet-700">Criação de Imagens</span>
          <span className="text-[11px] text-violet-500 line-clamp-2">Formato, cores da marca e referência num só lugar</span>
        </button>

        {AI_SQUADS.map(squad => (
          <button
            key={squad.id}
            onClick={() => navigate(`/ai/squad/${squad.id}`)}
            className="flex flex-col items-start gap-2 p-4 rounded-2xl border hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
            style={{ backgroundColor: squad.color.bg, borderColor: squad.color.border }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[17px]" style={{ backgroundColor: squad.color.dot }}>
              {squad.emoji}
            </div>
            <span className="text-[13px] font-semibold" style={{ color: squad.color.text }}>{squad.name}</span>
            <span className="text-[11px] text-[#666] line-clamp-2">{squad.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
