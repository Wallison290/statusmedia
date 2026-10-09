import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Lock, Menu, ShieldCheck, X,
  CalendarDays, Instagram, Target, FileSignature, MessageCircle, Users, BarChart3, Wallet,
  LayoutGrid, StickyNote, ClipboardList,
} from 'lucide-react'
import { PLANS } from '@/config/plans'

// ─── Conceito ─────────────────────────────────────────────────────────────────
// "Tech-luxo: a mesa de controle da agência." Fundo azul-noite profundo, o mesmo
// mundo visual do app, para quem assina reconhecer o produto que viu no site.
// Um acento azul elétrico usado com economia (5 a 10% da tela), títulos enormes
// em Bricolage Grotesque contra texto em Inter, ilustrações do produto real no
// lugar de ícones genéricos e ritmo que muda a cada seção: hero assimétrico,
// faixa cheia, duas colunas editoriais, mosaico, linha do tempo, split com
// celular, planos e fechamento atmosférico.
//
// IA aparece só nos planos, como recurso com cota (mensagens, análises, assistente).

// Tokens. Só estes; nada de cor solta no meio da página.
const TOKENS = `
.lp {
  --bg: #070B16;
  --surface: #0D1424;
  --surface-2: #121B2F;
  --line: rgba(148, 163, 184, 0.14);
  --line-strong: rgba(148, 163, 184, 0.26);
  --text: #EEF2F8;
  --muted: #8C98AE;
  --accent: #4C7DFF;
  --accent-soft: rgba(76, 125, 255, 0.14);
  --warm: #F5B544;
  background: var(--bg);
  color: var(--text);
  overflow-x: clip;
}
.lp ::selection { background: rgba(76, 125, 255, 0.35); }
.lp .reveal { opacity: 0; transform: translateY(28px); transition: opacity .8s cubic-bezier(.16,1,.3,1), transform .8s cubic-bezier(.16,1,.3,1); }
.lp .reveal.visible { opacity: 1; transform: none; }
.lp .hover-line { background-image: linear-gradient(currentColor, currentColor); background-size: 0% 1px; background-repeat: no-repeat; background-position: 0 100%; transition: background-size .35s cubic-bezier(.16,1,.3,1); }
.lp .hover-line:hover { background-size: 100% 1px; }
.lp .grain { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E"); opacity: .05; mix-blend-mode: overlay; }
@keyframes lp-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
.lp .marquee { animation: lp-marquee 38s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .lp .reveal { opacity: 1; transform: none; transition: none; }
  .lp .marquee { animation: none; }
  .lp * { scroll-behavior: auto !important; }
}
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
const scrollTo = (id: string) => () => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const BRL = (n: number) => `R$ ${n}`

// Dispara evento do Meta Pixel sem quebrar se o pixel estiver bloqueado
const trackPixel = (event: string, params?: Record<string, unknown>) => {
  try {
    const fbq = (window as any).fbq
    if (typeof fbq === 'function') fbq('track', event, params)
  } catch {}
}

// Conversão do Google Ads.
// TODO: criar a conversão no painel do Google Ads e colar o label aqui, no
// formato "AW-18301456637/AbC-D_efGhIjKlMnOp". Enquanto estiver vazio a função
// não dispara nada.
const ADS_CONVERSION_LABEL = ''

const trackAds = (value?: number) => {
  if (!ADS_CONVERSION_LABEL) return
  try {
    const gtag = (window as any).gtag
    if (typeof gtag === 'function') {
      gtag('event', 'conversion', { send_to: ADS_CONVERSION_LABEL, value: value ?? 0, currency: 'BRL' })
    }
  } catch {}
}

/**
 * Aparece ao rolar. O conteúdo nasce VISÍVEL e só é escondido depois que o
 * observador de rolagem existe: se o JavaScript falhar (robô do Google, prévia
 * de link, navegador antigo), a página continua inteira em vez de em branco.
 */
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: {
  children: React.ReactNode; className?: string; delay?: number; as?: 'div' | 'li' | 'section'
}) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<'idle' | 'hidden' | 'visible'>('idle')

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // Já na tela ao carregar: nem esconde, evita piscar
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) { setState('visible'); return }
    setState('hidden')
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setState('visible'); io.disconnect() }
    }, { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const cls = state === 'idle' ? '' : state === 'hidden' ? 'reveal' : 'reveal visible'
  const Comp = Tag as any
  return (
    <Comp ref={ref} className={`${cls} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Comp>
  )
}

// Rótulo pequeno em caixa alta: o único lugar com letter-spacing largo
function Eyebrow({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
      {n && <span className="font-display text-[var(--accent)] tracking-normal text-[13px]">{n}</span>}
      <span className="h-px w-8 bg-[var(--line-strong)]" />
      {children}
    </p>
  )
}

function CtaButton({ children, onClick, size = 'md', className = '' }: {
  children: React.ReactNode; onClick?: () => void; size?: 'md' | 'lg'; className?: string
}) {
  return (
    <Link
      to="/register"
      onClick={onClick}
      className={`group inline-flex items-center justify-center gap-2.5 rounded-full bg-[var(--accent)] font-semibold text-white
        transition-all duration-300 hover:bg-white hover:text-[var(--bg)]
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]
        ${size === 'lg' ? 'px-8 py-[18px] text-[16px]' : 'px-6 py-3.5 text-[15px]'} ${className}`}
    >
      {children}
      <ArrowRight className="w-[18px] h-[18px] transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  )
}

// ─── Ilustrações do produto ───────────────────────────────────────────────────
// Desenhadas com as mesmas peças do app (cores de etapa, cards, selos), para o
// visitante ver a tela que vai usar, não um ícone genérico.

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color, background: `${color}22` }}>{children}</span>
  )
}

function PipelineMock() {
  const cols = [
    { name: 'Novo lead', color: '#94a3b8', cards: [['Clínica Vida', 'R$ 1.800'], ['Studio Ana', 'R$ 1.200']] },
    { name: 'Proposta', color: '#8B5CF6', cards: [['Padaria Trigo', 'R$ 2.300'], ['Dra. Lima', 'R$ 2.700']] },
    { name: 'Negociação', color: '#F5B544', cards: [['Ótica Visão', 'R$ 3.100']] },
    { name: 'Ganho', color: '#22C55E', cards: [['Pet Amor', 'R$ 1.900']] },
  ]
  return (
    <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-3 shadow-[0_40px_120px_-40px_rgba(76,125,255,0.45)]">
      <div className="flex items-center justify-between px-1 pb-3">
        <p className="text-[12px] font-semibold">Funil comercial</p>
        <p className="text-[10.5px] text-[var(--muted)]">6 leads · <span className="text-[#22C55E]">R$ 13.000 na mesa</span></p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cols.map(c => (
          <div key={c.name} className="rounded-lg bg-[rgba(7,11,22,0.6)] p-2 min-h-[230px]">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold mb-1.5 px-0.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color }} />{c.name}
            </p>
            <div className="space-y-1.5">
              {c.cards.map(([n, v]) => (
                <div key={n} className="rounded-md bg-[var(--surface-2)] border border-[var(--line)] p-2">
                  <p className="text-[11.5px] font-medium truncate">{n}</p>
                  <p className="text-[10.5px] text-[#22C55E] mt-1">{v}</p>
                  <div className="mt-1.5 h-1 w-2/3 rounded-full bg-[var(--line)]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarMock() {
  const days = Array.from({ length: 14 }, (_, i) => i + 1)
  const posts: Record<number, [string, string]> = {
    2: ['Carrossel', '#4C7DFF'], 4: ['Reels', '#8B5CF6'], 6: ['Post', '#22C55E'],
    9: ['Carrossel', '#4C7DFF'], 11: ['Stories', '#F5B544'], 13: ['Reels', '#8B5CF6'],
  }
  return (
    <div className="grid grid-cols-7 gap-1">
      {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
        <p key={i} className="text-[9.5px] text-center text-[var(--muted)] pb-0.5">{d}</p>
      ))}
      {days.map(d => (
        <div key={d} className="aspect-square rounded-md border border-[var(--line)] bg-[rgba(7,11,22,0.5)] p-1 flex flex-col justify-between">
          <span className="text-[9px] text-[var(--muted)]">{d}</span>
          {posts[d] && <span className="h-1.5 rounded-full" style={{ background: posts[d][1] }} title={posts[d][0]} />}
        </div>
      ))}
    </div>
  )
}

function ApprovalMock() {
  return (
    <div className="rounded-xl bg-[#F8FAFC] text-[#0F172A] p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] rotate-[-2deg]">
      <p className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Portal do cliente</p>
      <div className="mt-2 aspect-[4/3] rounded-lg bg-gradient-to-br from-[#4C7DFF] to-[#8B5CF6] flex items-end p-2">
        <p className="text-white text-[11px] font-semibold leading-tight">5 dicas para o<br />sorriso perfeito</p>
      </div>
      <p className="text-[10.5px] mt-2 leading-snug text-[#334155]">Você sabia que 70% dos pacientes...</p>
      <div className="grid grid-cols-2 gap-1.5 mt-2.5">
        <span className="text-center text-[10.5px] font-semibold rounded-md py-1.5 bg-[#16a34a] text-white">Aprovar</span>
        <span className="text-center text-[10.5px] font-semibold rounded-md py-1.5 border border-[#cbd5e1] text-[#475569]">Pedir ajuste</span>
      </div>
    </div>
  )
}

function WhatsAppMock() {
  const msgs = [
    { t: 'Oi, Marina! O conteúdo de outubro está pronto para você aprovar 👇', time: '09:02' },
    { t: 'statusmedia.com.br/portal', link: true, time: '09:02' },
    { t: 'Segue a proposta da Agência Norte. Você aprova direto pelo link:', time: '14:31' },
  ]
  return (
    <div className="relative mx-auto w-[260px] rounded-[38px] border border-[var(--line-strong)] bg-[#0B141A] p-2.5 shadow-[0_50px_120px_-40px_rgba(34,197,94,0.35)]">
      <div className="rounded-[30px] overflow-hidden bg-[#0B141A]">
        <div className="flex items-center gap-2 px-3.5 py-3 bg-[#1F2C34]">
          <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-[11px] font-bold">AN</div>
          <div>
            <p className="text-[12px] font-semibold leading-none">Agência Norte</p>
            <p className="text-[9.5px] text-[#8696a0] mt-0.5">o número da sua agência</p>
          </div>
        </div>
        <div className="space-y-2 p-3 min-h-[250px]">
          {msgs.map((m, i) => (
            <div key={i} className="ml-auto max-w-[88%] rounded-lg rounded-tr-none bg-[#005C4B] px-2.5 py-1.5">
              <p className={`text-[11px] leading-snug ${m.link ? 'text-[#53BDEB] underline' : ''}`}>{m.t}</p>
              <p className="text-[8.5px] text-right text-[#99BEB7] mt-0.5">{m.time} ✓✓</p>
            </div>
          ))}
          <div className="max-w-[70%] rounded-lg rounded-tl-none bg-[#1F2C34] px-2.5 py-1.5">
            <p className="text-[11px]">Aprovado! 🙌</p>
            <p className="text-[8.5px] text-right text-[#8696a0] mt-0.5">14:40</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const links = [['Plataforma', 'plataforma'], ['Como funciona', 'como-funciona'], ['Planos', 'planos'], ['Dúvidas', 'faq']] as const

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${scrolled || open ? 'bg-[rgba(7,11,22,0.85)] backdrop-blur-md border-b border-[var(--line)]' : 'border-b border-transparent'}`}>
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <picture>
            <source srcSet="/logo-icon.avif" type="image/avif" />
            <source srcSet="/logo-icon.webp" type="image/webp" />
            <img src="/logo-icon.png" alt="" width={30} height={30} className="w-[30px] h-[30px] object-contain" />
          </picture>
          <span className="font-display text-[19px] font-bold">StatusMedia</span>
        </div>

        <nav className="hidden md:flex items-center gap-9">
          {links.map(([label, id]) => (
            <button key={id} onClick={scrollTo(id)} className="hover-line text-[14.5px] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link to="/login" className="hidden sm:inline hover-line text-[14.5px] font-medium">Entrar</Link>
          <Link
            to="/register"
            onClick={() => { trackPixel('Lead', { content_name: 'navbar_trial' }); trackAds() }}
            className="hidden sm:inline-flex items-center rounded-full border border-[var(--line-strong)] px-5 py-2.5 text-[14px] font-semibold
              transition-colors duration-300 hover:bg-[var(--text)] hover:text-[var(--bg)]"
          >
            Testar 3 dias
          </Link>
          <button className="md:hidden p-1" onClick={() => setOpen(o => !o)} aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open}>
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-[var(--line)] px-5 py-4 space-y-1">
          {links.map(([label, id]) => (
            <button key={id} onClick={() => { setOpen(false); scrollTo(id)() }} className="block w-full text-left text-[17px] font-medium py-2.5">
              {label}
            </button>
          ))}
          <div className="pt-3 flex flex-col gap-3">
            <Link to="/login" className="text-[16px] text-[var(--muted)] py-1">Entrar</Link>
            <Link
              to="/register"
              onClick={() => { trackPixel('Lead', { content_name: 'navbar_mobile_trial' }); trackAds() }}
              className="rounded-full bg-[var(--accent)] px-6 py-3.5 text-[15px] font-semibold text-white text-center"
            >
              Começar teste de 3 dias
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

// ─── 1. Hero (assimétrico) ────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative pt-[120px] sm:pt-[150px] pb-20 lg:pb-32">
      {/* Luz azul vinda do canto: a única "decoração" do topo */}
      <div className="pointer-events-none absolute -top-40 right-[-10%] w-[900px] h-[700px] rounded-full opacity-60"
           style={{ background: 'radial-gradient(closest-side, rgba(76,125,255,0.22), transparent)' }} aria-hidden />
      <div className="grain pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative max-w-[1320px] mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-6 items-center">
        <div className="lg:col-span-7">
          <Reveal><Eyebrow>Para agências e social medias</Eyebrow></Reveal>
          <Reveal delay={60}>
            <h1 className="font-display font-extrabold mt-7 text-[clamp(3.2rem,8.4vw,8.25rem)] leading-[0.92] tracking-[-0.045em]">
              A agência<br />inteira sob<br />
              <span className="relative inline-block text-[var(--accent)]">
                controle.
                <svg className="absolute left-0 -bottom-2 w-full" viewBox="0 0 300 12" fill="none" aria-hidden>
                  <path d="M2 9C60 3 150 2 298 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".55" />
                </svg>
              </span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-9 max-w-[520px] text-[17px] sm:text-[18.5px] leading-relaxed text-[var(--muted)]">
              Planejamento, aprovação do cliente, Instagram, CRM, contratos e financeiro num só lugar.
              Sem pular entre planilha, Drive, Trello e grupo de WhatsApp.
            </p>
          </Reveal>
          <Reveal delay={180} className="mt-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <CtaButton size="lg" onClick={() => { trackPixel('Lead', { content_name: 'hero_trial' }); trackAds() }}>
              Começar teste de 3 dias
            </CtaButton>
            <button onClick={scrollTo('plataforma')} className="hover-line self-start sm:self-auto text-[15px] font-medium">
              Ver a plataforma por dentro
            </button>
          </Reveal>
          <Reveal delay={240} className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--muted)]">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[var(--accent)]" /> 3 dias de teste</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[var(--accent)]" /> Sem fidelidade</span>
            <span className="flex items-center gap-1.5"><Lock className="w-4 h-4 text-[var(--accent)]" /> Dados protegidos</span>
          </Reveal>
        </div>

        {/* Produto sangrando para a direita */}
        <Reveal delay={200} className="lg:col-span-5 relative">
          {/* Sangra para fora da coluna e da tela: o produto é maior que o grid */}
          <div className="w-[600px] sm:w-auto lg:w-[780px] lg:[transform:perspective(1800px)_rotateY(-7deg)] origin-left">
            <PipelineMock />
          </div>
          <div className="hidden sm:block absolute -bottom-16 -left-4 lg:-left-16 w-[170px]">
            <ApprovalMock />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── 2. Faixa: o que sai de cena ──────────────────────────────────────────────
function ReplacesBand() {
  const tools = ['Planilha de calendário', 'Pasta no Drive', 'Quadro no Trello', 'Grupo de WhatsApp', 'Proposta em PDF', 'Contrato impresso', 'Cobrança no susto']
  const row = [...tools, ...tools]
  return (
    <section className="border-y border-[var(--line)] py-6 overflow-hidden" aria-label="Ferramentas que a StatusMedia substitui">
      <div className="marquee flex w-max gap-12">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-12 whitespace-nowrap font-display text-[26px] sm:text-[34px] font-semibold text-[rgba(140,152,174,0.7)]">
            <span className="line-through decoration-[var(--accent)] decoration-[3px]">{t}</span>
            <span className="text-[var(--accent)] text-[20px]" aria-hidden>✳</span>
          </span>
        ))}
      </div>
    </section>
  )
}

// ─── 3. O problema (editorial, duas colunas) ──────────────────────────────────
function Problem() {
  const pains = [
    'Aprovação de conteúdo perdida no meio da conversa do WhatsApp',
    'Calendário editorial numa planilha que só você entende',
    'Lead que pediu orçamento e ninguém respondeu',
    'Proposta em PDF que o cliente abriu e você nem sabe',
    'Tarefa sem dono e sem prazo',
    'Cliente que atrasa o pagamento e ninguém cobra',
  ]
  return (
    <section className="py-[clamp(6rem,15vh,11rem)]">
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-14">
        <Reveal className="lg:col-span-5 lg:sticky lg:top-32 self-start">
          <Eyebrow n="01">O problema</Eyebrow>
          <h2 className="font-display font-bold mt-6 text-[clamp(2.4rem,5vw,4.4rem)] leading-[0.98] tracking-[-0.035em]">
            Você não tem um problema de produção. Tem um problema de <span className="text-[var(--accent)]">controle.</span>
          </h2>
          <p className="mt-7 text-[16.5px] leading-relaxed text-[var(--muted)] max-w-[440px]">
            A equipe passa mais tempo coordenando do que executando. E cada aba a mais é um pedaço da agência que escapa.
          </p>
        </Reveal>
        <ol className="lg:col-span-6 lg:col-start-7 border-t border-[var(--line)]">
          {pains.map((p, i) => (
            <Reveal as="li" key={p} delay={i * 50} className="group flex gap-6 items-baseline border-b border-[var(--line)] py-7">
              <span className="font-display text-[15px] text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-[19px] sm:text-[22px] leading-snug group-hover:translate-x-1 transition-transform duration-300">{p}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ─── 4. A plataforma (mosaico) ────────────────────────────────────────────────
function Platform() {
  const more = [
    { icon: Users, t: 'Tarefas e equipe' }, { icon: BarChart3, t: 'Relatórios mensais do Instagram' },
    { icon: Wallet, t: 'Financeiro e cobrança' }, { icon: LayoutGrid, t: 'Feed do perfil' },
    { icon: ClipboardList, t: 'Formulário semanal do cliente' },
    { icon: StickyNote, t: 'Notas por cliente' },
  ]
  return (
    <section id="plataforma" className="py-[clamp(6rem,15vh,11rem)] bg-[rgba(13,20,36,0.4)] border-y border-[var(--line)]">
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8">
        <Reveal className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-7">
            <Eyebrow n="02">A plataforma</Eyebrow>
            <h2 className="font-display font-bold mt-6 text-[clamp(2.4rem,5.5vw,5rem)] leading-[0.95] tracking-[-0.04em]">
              Do primeiro contato ao post publicado.
            </h2>
          </div>
          <p className="lg:col-span-4 lg:col-start-9 text-[16.5px] leading-relaxed text-[var(--muted)]">
            Cada cliente com o próprio espaço: briefing, arquivos, calendário, aprovações e histórico. Nada se perde entre um mês e outro.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Planejamento: o card grande */}
          <Reveal className="md:col-span-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 sm:p-9 grid sm:grid-cols-2 gap-8 items-center">
            <div>
              <CalendarDays className="w-6 h-6 text-[var(--accent)]" />
              <h3 className="font-display text-[28px] font-bold mt-5 leading-tight">Planejamento editorial</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
                O mês inteiro de cada cliente numa tela. Arte, legenda, anexos e comentários no mesmo lugar do post.
              </p>
            </div>
            <CalendarMock />
          </Reveal>

          {/* Aprovação: alto, com o celular do cliente */}
          <Reveal delay={80} className="md:col-span-2 md:row-span-2 rounded-3xl border border-[var(--line)] bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] p-7 sm:p-9 flex flex-col">
            <CheckCircle2 className="w-6 h-6 text-[var(--accent)]" />
            <h3 className="font-display text-[28px] font-bold mt-5 leading-tight">O cliente aprova sozinho</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
              Portal próprio para cada cliente: vê o carrossel inteiro, aprova ou pede ajuste. Tudo registrado.
            </p>
            <div className="mt-auto pt-10 px-4"><ApprovalMock /></div>
          </Reveal>

          {/* Instagram */}
          <Reveal className="md:col-span-2 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 sm:p-8">
            <Instagram className="w-6 h-6 text-[var(--accent)]" />
            <h3 className="font-display text-[23px] font-bold mt-5 leading-tight">Publica no Instagram</h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-[var(--muted)]">
              Aprovou, está agendado. A publicação sai sozinha na data marcada.
            </p>
          </Reveal>

          {/* CRM */}
          <Reveal delay={80} className="md:col-span-2 rounded-3xl border border-[rgba(76,125,255,0.4)] bg-[var(--accent-soft)] p-7 sm:p-8">
            <Target className="w-6 h-6 text-[var(--accent)]" />
            <h3 className="font-display text-[23px] font-bold mt-5 leading-tight">CRM para vender</h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-[var(--muted)]">
              Funil de leads, lembrete dos retornos do dia e formulário que joga o lead direto no funil.
            </p>
          </Reveal>

          {/* Proposta e contrato: faixa larga */}
          <Reveal className="md:col-span-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 sm:p-9 grid md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-5">
              <FileSignature className="w-6 h-6 text-[var(--accent)]" />
              <h3 className="font-display text-[28px] font-bold mt-5 leading-tight">Proposta aceita pelo link. Contrato assinado pelo celular.</h3>
            </div>
            <ol className="md:col-span-7 grid sm:grid-cols-3 gap-px bg-[var(--line)] rounded-2xl overflow-hidden">
              {[
                ['Você envia', 'A proposta sai no WhatsApp do cliente, pelo número da agência.'],
                ['Ele abre e aceita', 'Você é avisado na hora. O card do lead anda sozinho para ganho.'],
                ['Contrato assinado', 'Com CPF, rubrica e registro de data e IP. Pronto para salvar em PDF.'],
              ].map(([t, d], i) => (
                <li key={t} className="bg-[var(--surface)] p-5">
                  <span className="font-display text-[var(--accent)] text-[14px]">0{i + 1}</span>
                  <p className="font-semibold mt-2 text-[15.5px]">{t}</p>
                  <p className="text-[13.5px] text-[var(--muted)] mt-1.5 leading-relaxed">{d}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>

        {/* O resto: lista tipográfica, não mais uma grade de cards */}
        <Reveal className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-4">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">E ainda</span>
          {more.map(m => (
            <span key={m.t} className="flex items-center gap-2 text-[15.5px]">
              <m.icon className="w-4 h-4 text-[var(--muted)]" /> {m.t}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

// ─── 5. Como funciona (linha do tempo) ────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { t: 'Cadastre o cliente', d: 'Briefing, arquivos, tom de voz e acessos num espaço só dele. O cliente recebe o convite para o portal.' },
    { t: 'Planeje e aprove', d: 'Monte o mês no calendário. O cliente aprova pelo portal e você é avisado no WhatsApp.' },
    { t: 'Publique e cresça', d: 'Posts saem sozinhos no Instagram, o relatório do mês fica pronto e o CRM traz os próximos clientes.' },
  ]
  return (
    <section id="como-funciona" className="py-[clamp(6rem,15vh,11rem)]">
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8">
        <Reveal>
          <Eyebrow n="03">Como funciona</Eyebrow>
          <h2 className="font-display font-bold mt-6 text-[clamp(2.4rem,5vw,4.4rem)] leading-[0.98] tracking-[-0.035em] max-w-[800px]">
            Três passos. No primeiro dia.
          </h2>
        </Reveal>
        <ol className="mt-20 grid md:grid-cols-3 gap-12 md:gap-8 relative">
          <span className="hidden md:block absolute top-[46px] left-0 right-0 h-px bg-[var(--line-strong)]" aria-hidden />
          {steps.map((s, i) => (
            <Reveal as="li" key={s.t} delay={i * 120} className="relative">
              <span className="font-display font-extrabold text-[92px] leading-none tracking-[-0.05em] text-transparent [-webkit-text-stroke:1.5px_var(--line-strong)]">
                0{i + 1}
              </span>
              <span className="hidden md:block absolute top-[40px] left-[118px] w-3 h-3 rounded-full bg-[var(--accent)] ring-8 ring-[var(--bg)]" aria-hidden />
              <h3 className="font-display text-[26px] font-bold mt-6">{s.t}</h3>
              <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--muted)] max-w-[340px]">{s.d}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ─── 6. WhatsApp da agência (split) ───────────────────────────────────────────
function WhatsAppSection() {
  return (
    <section className="relative py-[clamp(6rem,15vh,11rem)] border-y border-[var(--line)] overflow-hidden">
      <div className="pointer-events-none absolute left-[-15%] top-1/3 w-[700px] h-[500px] rounded-full opacity-50"
           style={{ background: 'radial-gradient(closest-side, rgba(34,197,94,0.14), transparent)' }} aria-hidden />
      <div className="relative max-w-[1320px] mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
        <Reveal className="lg:col-span-5 lg:order-2">
          <Eyebrow n="04">WhatsApp da agência</Eyebrow>
          <h2 className="font-display font-bold mt-6 text-[clamp(2.4rem,5vw,4.4rem)] leading-[0.98] tracking-[-0.035em]">
            Os avisos saem do <span className="text-[var(--accent)]">seu</span> número.
          </h2>
          <p className="mt-7 text-[16.5px] leading-relaxed text-[var(--muted)] max-w-[460px]">
            Conecte o WhatsApp da agência lendo um QR code. A partir daí o cliente recebe o conteúdo para aprovar,
            a proposta e o contrato de um número que ele já conhece. E você recebe os avisos de post publicado e de proposta aceita.
          </p>
          <ul className="mt-8 space-y-3">
            {['Conteúdo novo para aprovar', 'Proposta e contrato com um clique', 'Aviso quando o cliente aprova ou aceita'].map(t => (
              <li key={t} className="flex items-center gap-3 text-[15.5px]">
                <MessageCircle className="w-4 h-4 text-[#22C55E]" /> {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="lg:col-span-6 lg:order-1 lg:col-start-1"><WhatsAppMock /></Reveal>
      </div>
    </section>
  )
}

// ─── 7. Planos ────────────────────────────────────────────────────────────────
// Preços e itens vêm de @/config/plans (fonte única com o app e o Stripe). O
// grupo "IA" lista as cotas de IA de cada plano.
function Pricing() {
  const order: ('starter' | 'pro' | 'agency')[] = ['starter', 'pro', 'agency']
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        trackPixel('ViewContent', { content_name: 'pricing_section', content_type: 'product' })
        observer.disconnect()
      }
    }, { threshold: 0.25 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} id="planos" className="py-[clamp(6rem,15vh,11rem)]">
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8">
        <Reveal className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-7">
            <Eyebrow n="05">Planos</Eyebrow>
            <h2 className="font-display font-bold mt-6 text-[clamp(2.4rem,5vw,4.4rem)] leading-[0.98] tracking-[-0.035em]">
              Do tamanho da sua operação.
            </h2>
          </div>
          <p className="lg:col-span-4 lg:col-start-9 text-[16px] leading-relaxed text-[var(--muted)]">
            Todos incluem CRM com propostas e contratos e o WhatsApp da agência. 3 dias de teste, sem fidelidade.
          </p>
        </Reveal>

        <div className="mt-16 grid md:grid-cols-3 gap-4 md:gap-0 items-stretch">
          {order.map((id, i) => {
            const p = PLANS[id]
            const isPro = id === 'pro'
            const groups = p.featureGroups
            return (
              <Reveal
                key={id}
                delay={i * 80}
                className={`relative flex flex-col p-8 sm:p-9 rounded-3xl
                  ${isPro
                    ? 'bg-[var(--text)] text-[var(--bg)] md:-my-6 z-10 shadow-[0_40px_120px_-30px_rgba(76,125,255,0.5)]'
                    : `border border-[var(--line)] ${i === 0 ? 'md:rounded-r-none md:border-r-0' : 'md:rounded-l-none md:border-l-0'}`}`}
              >
                {/* Sem selo, guarda o espaço: os três cartões alinham pelo preço */}
                {!p.badge && <span className="h-[27px]" aria-hidden />}
                {p.badge && (
                  <span className={`self-start text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full
                    ${isPro ? 'bg-[var(--accent)] text-white' : 'border border-[var(--line-strong)] text-[var(--muted)]'}`}>
                    {p.badge}
                  </span>
                )}
                <h3 className="font-display text-[30px] font-bold mt-5">{p.name}</h3>
                <p className={`text-[14.5px] mt-1.5 min-h-[44px] ${isPro ? 'text-[#475569]' : 'text-[var(--muted)]'}`}>{p.description}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-display text-[60px] font-extrabold leading-none tracking-[-0.04em]">{BRL(p.price)}</span>
                  <span className={isPro ? 'text-[#475569]' : 'text-[var(--muted)]'}>/mês</span>
                </div>
                <Link
                  to="/register"
                  onClick={() => {
                    trackPixel('InitiateCheckout', { content_name: p.name, content_ids: [id], value: p.price, currency: 'BRL', num_items: 1 })
                    trackAds(p.price)
                  }}
                  className={`mt-8 w-full py-3.5 rounded-full text-[15px] font-semibold text-center transition-colors duration-300
                    ${isPro
                      ? 'bg-[var(--accent)] text-white hover:bg-[var(--bg)]'
                      : 'border border-[var(--line-strong)] hover:bg-[var(--text)] hover:text-[var(--bg)]'}`}
                >
                  Começar com o {p.name}
                </Link>
                <div className="mt-8 space-y-6">
                  {groups.map(g => (
                    <div key={g.title}>
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] mb-3 ${isPro ? 'text-[#64748b]' : 'text-[var(--muted)]'}`}>{g.title}</p>
                      <ul className="space-y-2.5">
                        {g.items.map(f => (
                          <li key={f} className="flex items-start gap-2.5 text-[14.5px]">
                            <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--accent)]" /> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── 8. Dúvidas (título fixo à esquerda) ──────────────────────────────────────
function Faq() {
  const faqs = [
    ['A StatusMedia substitui quais ferramentas?', 'A planilha ou o Trello do calendário, a pasta do Drive de cada cliente, o grupo de WhatsApp da aprovação, a proposta em PDF, o contrato impresso e o controle de pagamentos. Tudo num fluxo só.'],
    ['Como o cliente aprova o conteúdo?', 'Cada cliente tem acesso próprio ao portal. Ele vê a arte e a legenda, aprova ou pede ajuste, e você é avisado na hora pelo WhatsApp.'],
    ['As mensagens saem de qual número?', 'Do WhatsApp da própria agência. Você conecta lendo um QR code, como no WhatsApp Web, e o cliente recebe tudo de um número que ele já conhece.'],
    ['Como funcionam a proposta e o contrato?', 'Você monta a proposta no CRM e envia o link. O cliente aceita pelo celular e o lead anda sozinho para ganho. O contrato já vem preenchido e o cliente assina com CPF e rubrica.'],
    ['Serve para quem está começando?', 'Sim. O plano Starter é feito para a social media que está organizando os primeiros clientes. E são 3 dias de teste.'],
    ['Serve para agência com equipe?', 'Sim. Cada pessoa da equipe tem seu acesso às tarefas, e o plano Agency tem usuários ilimitados.'],
    ['Tem fidelidade?', 'Não. Sem fidelidade: cancela quando quiser, e os 3 primeiros dias são para testar.'],
    ['O sistema inclui financeiro?', 'Sim. Você acompanha o pagamento de cada cliente e cobra pelo WhatsApp com um clique.'],
  ]
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="py-[clamp(6rem,15vh,11rem)] border-t border-[var(--line)]">
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <Reveal className="lg:col-span-4 lg:sticky lg:top-32 self-start">
          <Eyebrow n="06">Dúvidas</Eyebrow>
          <h2 className="font-display font-bold mt-6 text-[clamp(2.4rem,4.5vw,3.8rem)] leading-[0.98] tracking-[-0.035em]">
            Antes de assinar.
          </h2>
        </Reveal>
        <div className="lg:col-span-7 lg:col-start-6 border-t border-[var(--line)]">
          {faqs.map(([q, a], i) => (
            <div key={i} className="border-b border-[var(--line)]">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="group w-full flex items-center justify-between gap-6 py-6 text-left"
              >
                <span className="text-[18px] sm:text-[20px] font-medium group-hover:text-[var(--accent)] transition-colors">{q}</span>
                <ChevronDown className={`w-5 h-5 shrink-0 text-[var(--muted)] transition-transform duration-300 ${open === i ? 'rotate-180' : ''}`} />
              </button>
              <div className={`grid transition-[grid-template-rows] duration-300 ${open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <p className="overflow-hidden text-[15.5px] leading-relaxed text-[var(--muted)] max-w-[640px]">
                  <span className="block pb-6">{a}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── 9. Fechamento (atmosférico, com a marca em movimento) ────────────────────
function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-[var(--line)]">
      <video autoPlay loop muted playsInline poster="/video-poster.webp" aria-hidden
             className="absolute inset-0 w-full h-full object-cover opacity-35">
        <source src="/logo-video.webm" type="video/webm" />
        <source src="/logo-video.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[rgba(7,11,22,0.7)] to-[var(--bg)]" aria-hidden />
      <div className="relative max-w-[1320px] mx-auto px-5 sm:px-8 py-[clamp(7rem,20vh,14rem)]">
        <Reveal>
          <h2 className="font-display font-extrabold text-[clamp(3rem,9vw,8.5rem)] leading-[0.92] tracking-[-0.045em] max-w-[1100px]">
            Organize. Produza.<br /><span className="text-[var(--accent)]">Escale.</span>
          </h2>
        </Reveal>
        <Reveal delay={120} className="mt-12 flex flex-col sm:flex-row sm:items-center gap-6">
          <CtaButton size="lg" onClick={() => { trackPixel('Lead', { content_name: 'final_cta' }); trackAds() }}>
            Testar 3 dias grátis
          </CtaButton>
          <p className="text-[14px] text-[var(--muted)]">Sem fidelidade. Cancela quando quiser.</p>
        </Reveal>
      </div>
    </section>
  )
}

// ─── Rodapé ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-[var(--line)] px-5 sm:px-8 py-14">
      <div className="max-w-[1320px] mx-auto flex flex-col md:flex-row justify-between gap-10">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/logo-icon.png" alt="" width={26} height={26} className="w-[26px] h-[26px] object-contain" />
            <span className="font-display text-[18px] font-bold">StatusMedia</span>
          </div>
          <p className="mt-3 text-[14px] text-[var(--muted)] max-w-[300px] leading-relaxed">
            A operação inteira da agência num só lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-14">
          <div className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)] font-semibold">Produto</p>
            {[['Plataforma', 'plataforma'], ['Como funciona', 'como-funciona'], ['Planos', 'planos'], ['Dúvidas', 'faq']].map(([l, id]) => (
              <button key={id} onClick={scrollTo(id)} className="hover-line block text-[14.5px]">{l}</button>
            ))}
          </div>
          <div className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)] font-semibold">Acesso</p>
            <Link to="/login" className="hover-line block text-[14.5px]">Entrar</Link>
            <Link to="/privacy" className="hover-line block text-[14.5px]">Privacidade</Link>
            <Link to="/terms" className="hover-line block text-[14.5px]">Termos de uso</Link>
          </div>
        </div>
      </div>
      <p className="max-w-[1320px] mx-auto mt-12 flex items-center justify-between text-[12.5px] text-[var(--muted)]">
        <span>© {new Date().getFullYear()} StatusMedia</span>
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="hover-line flex items-center gap-1">
          Voltar ao topo <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </p>
    </footer>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────
export function LandingPage() {
  return (
    <div className="lp min-h-screen">
      <style>{TOKENS}</style>
      <Navbar />
      <main>
        <Hero />
        <ReplacesBand />
        <Problem />
        <Platform />
        <HowItWorks />
        <WhatsAppSection />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
