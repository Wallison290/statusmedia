import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Wand2, Copy, Download, RefreshCw, Lightbulb,
  ChevronDown, ChevronUp, Save, TrendingUp, Check
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useClients } from '@/hooks/useClients'
import { useBrandDNA } from '@/hooks/useClients'
import { useSaveContent } from '@/hooks/useContents'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { generateContent, improveText } from '@/services/openai'
import { getTrends } from '@/services/trendService'
import type { ContentGeneratorForm, GeneratedContent } from '@/types'
import { copyToClipboard } from '@/utils/formatters'

const defaultForm: ContentGeneratorForm = {
  client_id: null, term: '', objective: 'engajar', content_type: 'post',
  tone_of_voice: 'Profissional e próximo', caption_size: 'medio',
  include_emojis: true, include_hashtags: true, additional_notes: '',
}

function ContentField({ label, value, onChange, multiline = false, rows = 3 }: {
  label: string, value: string, onChange: (v: string) => void, multiline?: boolean, rows?: number
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-400">{label}</label>
        <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors">
          {copied ? <><Check className="w-3 h-3 text-green-400" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
        </button>
      </div>
      {multiline ? (
        <Textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} showCount className="text-sm" />
      ) : (
        <Input value={value} onChange={e => onChange(e.target.value)} className="text-sm" />
      )}
    </div>
  )
}

export function ContentGenerator() {
  const [searchParams] = useSearchParams()
  const { user, agencyId } = useAuth()
  const { data: clients } = useClients()
  const saveContent = useSaveContent()
  const { toast } = useToast()

  const [form, setForm] = useState<ContentGeneratorForm>({
    ...defaultForm,
    client_id: searchParams.get('client'),
  })
  const [generated, setGenerated] = useState<GeneratedContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [improving, setImproving] = useState<string | null>(null)
  const [showTrends, setShowTrends] = useState(false)
  const [trends, setTrends] = useState<Awaited<ReturnType<typeof getTrends>> | null>(null)
  const [loadingTrends, setLoadingTrends] = useState(false)
  const [saved, setSaved] = useState(false)

  const selectedClient = clients?.find(c => c.id === form.client_id)
  const { data: dna } = useBrandDNA(form.client_id || '')

  const set = (field: keyof ContentGeneratorForm, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleGenerate = async () => {
    if (!form.term.trim()) { toast('Informe o termo principal.', 'error'); return }
    setLoading(true)
    setSaved(false)
    try {
      const result = await generateContent(form, selectedClient, dna)
      setGenerated(result)
      toast('Conteúdo gerado com sucesso!', 'success')
    } catch (err: any) {
      toast(err.message || 'Erro ao gerar conteúdo. Verifique sua API key.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleImprove = async (field: 'caption', action: 'melhorar' | 'encurtar' | 'expandir' | 'persuasivo') => {
    if (!generated?.caption) return
    setImproving(action)
    try {
      const improved = await improveText(generated.caption, action)
      setGenerated(prev => prev ? { ...prev, caption: improved } : null)
      toast('Texto melhorado!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setImproving(null)
    }
  }

  const handleSave = async () => {
    if (!generated || !user) return
    try {
      await saveContent.mutateAsync({
        user_id: agencyId!,
        client_id: form.client_id,
        term: form.term,
        objective: form.objective,
        content_type: form.content_type,
        tone_of_voice: form.tone_of_voice,
        caption_size: form.caption_size,
        include_emojis: form.include_emojis,
        include_hashtags: form.include_hashtags,
        additional_notes: form.additional_notes || null,
        title: generated.title,
        subtitle: generated.subtitle,
        caption: generated.caption,
        cta: generated.cta,
        hashtags: generated.hashtags,
        keywords: generated.keywords,
        visual_suggestion: generated.visual_suggestion,
        carousel_ideas: generated.carousel_ideas,
        video_script: generated.video_script,
        status: 'gerado',
        version: 1,
      })
      setSaved(true)
      toast('Conteúdo salvo!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleCopyAll = async () => {
    if (!generated) return
    const text = [
      `📌 ${generated.title}`,
      generated.subtitle && `💡 ${generated.subtitle}`,
      `\n${generated.caption}`,
      generated.cta && `\n👉 ${generated.cta}`,
      generated.hashtags && `\n${generated.hashtags}`,
    ].filter(Boolean).join('\n')
    await copyToClipboard(text)
    toast('Tudo copiado!', 'success')
  }

  const handleLoadTrends = async () => {
    if (!form.term.trim()) { toast('Informe o termo principal primeiro.', 'error'); return }
    setLoadingTrends(true)
    const data = await getTrends(form.term, selectedClient?.niche)
    setTrends(data)
    setShowTrends(true)
    setLoadingTrends(false)
  }

  return (
    <div>
      <div className="p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-6">
          {/* Form */}
          <div className="lg:col-span-1 xl:col-span-2 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400" /> Configurar Conteúdo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {/* Client */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Cliente (opcional)</label>
                  <Select value={form.client_id || '__none__'} onValueChange={v => set('client_id', v === '__none__' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Sem cliente específico" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem cliente específico</SelectItem>
                      {(clients || []).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Input
                  label="Termo principal *"
                  value={form.term}
                  onChange={e => set('term', e.target.value)}
                  placeholder="Ex: gestão de redes sociais, personal trainer, café especial..."
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Tipo</label>
                    <Select value={form.content_type} onValueChange={v => set('content_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['post','carrossel','reels','story','educativo','venda','autoridade','engajamento'].map(t => (
                          <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Objetivo</label>
                    <Select value={form.objective} onValueChange={v => set('objective', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="atrair_atencao">Atrair atenção</SelectItem>
                        <SelectItem value="engajar">Engajar</SelectItem>
                        <SelectItem value="gerar_autoridade">Autoridade</SelectItem>
                        <SelectItem value="gerar_leads">Gerar leads</SelectItem>
                        <SelectItem value="vender">Vender</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Input
                  label="Tom de voz"
                  value={form.tone_of_voice}
                  onChange={e => set('tone_of_voice', e.target.value)}
                  placeholder="Ex: Enérgico, motivacional, próximo"
                />

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Tamanho</label>
                    <Select value={form.caption_size} onValueChange={v => set('caption_size', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="curto">Curto</SelectItem>
                        <SelectItem value="medio">Médio</SelectItem>
                        <SelectItem value="longo">Longo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Emojis</label>
                    <Select value={form.include_emojis ? 'sim' : 'nao'} onValueChange={v => set('include_emojis', v === 'sim')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Hashtags</label>
                    <Select value={form.include_hashtags ? 'sim' : 'nao'} onValueChange={v => set('include_hashtags', v === 'sim')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Textarea
                  label="Observações adicionais"
                  value={form.additional_notes}
                  onChange={e => set('additional_notes', e.target.value)}
                  placeholder="Mencionar promoção, data especial, contexto específico..."
                  rows={2}
                />

                <div className="flex gap-2">
                  <Button onClick={handleGenerate} variant="premium" className="flex-1" disabled={loading}>
                    {loading ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Gerando...</>
                    ) : (
                      <><Wand2 className="w-4 h-4" /> Gerar com IA</>
                    )}
                  </Button>
                  <Button onClick={handleLoadTrends} variant="outline" size="icon" disabled={loadingTrends} title="Ver tendências">
                    {loadingTrends ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Trends */}
            <AnimatePresence>
              {trends && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-400" /> Tendências
                        </CardTitle>
                        <button onClick={() => setShowTrends(!showTrends)} className="text-gray-500 hover:text-white">
                          {showTrends ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </CardHeader>
                    {showTrends && (
                      <CardContent className="space-y-3">
                        {trends.content_angles.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 font-medium mb-1.5">Ângulos de conteúdo</p>
                            {trends.content_angles.map((a, i) => (
                              <button
                                key={i}
                                onClick={() => set('term', a)}
                                className="block w-full text-left text-xs text-gray-300 hover:text-white py-1 px-2 rounded hover:bg-white/5 transition-colors"
                              >
                                → {a}
                              </button>
                            ))}
                          </div>
                        )}
                        {trends.people_also_ask.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 font-medium mb-1.5">Perguntas do público</p>
                            {trends.people_also_ask.map((q, i) => (
                              <button
                                key={i}
                                onClick={() => set('term', q)}
                                className="block w-full text-left text-xs text-gray-300 hover:text-white py-1 px-2 rounded hover:bg-white/5 transition-colors"
                              >
                                ? {q}
                              </button>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Result */}
          <div className="lg:col-span-1 xl:col-span-3">
            <AnimatePresence mode="wait">
              {!generated && !loading && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-80 border-2 border-dashed border-white/8 rounded-2xl"
                >
                  <Sparkles className="w-12 h-12 text-gray-600 mb-3" />
                  <p className="text-gray-400 font-medium">Configure e gere seu conteúdo</p>
                  <p className="text-gray-600 text-sm mt-1">O resultado aparecerá aqui</p>
                </motion.div>
              )}

              {loading && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-80 border border-white/8 rounded-2xl bg-white/3"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles className="w-8 h-8 text-blue-400" />
                  </motion.div>
                  <p className="text-white font-medium mt-4">Gerando conteúdo estratégico...</p>
                  <p className="text-gray-500 text-sm mt-1">A IA está trabalhando para você</p>
                </motion.div>
              )}

              {generated && !loading && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Action bar */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-medium text-white flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" /> Conteúdo gerado
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={handleGenerate} variant="outline" size="sm">
                        <RefreshCw className="w-3.5 h-3.5" /> Regerar
                      </Button>
                      <Button onClick={handleCopyAll} variant="outline" size="sm">
                        <Copy className="w-3.5 h-3.5" /> Copiar tudo
                      </Button>
                      <Button onClick={handleSave} variant={saved ? 'success' : 'premium'} size="sm" disabled={saved || saveContent.isPending}>
                        {saved ? <><Check className="w-3.5 h-3.5" /> Salvo</> : <><Save className="w-3.5 h-3.5" /> Salvar</>}
                      </Button>
                    </div>
                  </div>

                  <Card>
                    <CardContent className="p-5 space-y-4">
                      <ContentField label="Título" value={generated.title || ''} onChange={v => setGenerated(p => p ? { ...p, title: v } : p)} />
                      <ContentField label="Subtítulo" value={generated.subtitle || ''} onChange={v => setGenerated(p => p ? { ...p, subtitle: v } : p)} />

                      {/* Caption with improve buttons */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-medium text-gray-400">Legenda</label>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-600">{(generated.caption || '').length} chars</span>
                            <button onClick={async () => { await copyToClipboard(generated.caption || ''); toast('Copiado!', 'success') }} className="text-xs text-gray-500 hover:text-white ml-2">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <Textarea
                          value={generated.caption || ''}
                          onChange={e => setGenerated(p => p ? { ...p, caption: e.target.value } : p)}
                          rows={8}
                          className="text-sm"
                        />
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {(['melhorar', 'encurtar', 'expandir', 'persuasivo'] as const).map(action => (
                            <button
                              key={action}
                              onClick={() => handleImprove('caption', action)}
                              disabled={improving !== null}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-white/10 text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/5 disabled:opacity-50 transition-all"
                            >
                              {improving === action ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Lightbulb className="w-3 h-3" />}
                              {action.charAt(0).toUpperCase() + action.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <ContentField label="CTA (Call to Action)" value={generated.cta || ''} onChange={v => setGenerated(p => p ? { ...p, cta: v } : p)} />
                      {form.include_hashtags && <ContentField label="Hashtags" value={generated.hashtags || ''} onChange={v => setGenerated(p => p ? { ...p, hashtags: v } : p)} />}
                      <ContentField label="Palavras-chave" value={generated.keywords || ''} onChange={v => setGenerated(p => p ? { ...p, keywords: v } : p)} />
                      <ContentField label="Sugestão Visual" value={generated.visual_suggestion || ''} onChange={v => setGenerated(p => p ? { ...p, visual_suggestion: v } : p)} multiline rows={2} />
                      {form.content_type === 'carrossel' && generated.carousel_ideas && (
                        <ContentField label="Slides do Carrossel" value={generated.carousel_ideas} onChange={v => setGenerated(p => p ? { ...p, carousel_ideas: v } : p)} multiline rows={4} />
                      )}
                      {(form.content_type === 'reels') && generated.video_script && (
                        <ContentField label="Roteiro do Vídeo" value={generated.video_script} onChange={v => setGenerated(p => p ? { ...p, video_script: v } : p)} multiline rows={5} />
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
