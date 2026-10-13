import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFollowupPrompt, cleanFollowupMessage, normalizeFollowupStyle, normalizeFollowupDays,
  followupDefaultGoal, followupStageName, nextFollowupDay, FOLLOWUP_GOALS, type FollowupPromptArgs,
} from './followup-style.ts'

const context: FollowupPromptArgs = {
  agency: 'Agência de teste',
  lead: { name: 'Ana Silva', company: 'Clínica de teste', notes: 'Prefere contato por escrito.' },
  offer: { name: 'Site', product: 'Página para agendamentos', price: 'R$ 497', tone: 'Descontraído', proof: 'Caso real aprovado' },
  step: 3,
  conversation: [
    { direction: 'out', text: 'Podemos organizar os agendamentos.', source: 'whatsapp' },
    { direction: 'in', text: 'Quero facilitar os agendamentos.', source: 'whatsapp' },
  ],
}

test('agências sem configuração mantêm tom do briefing, mensagem curta e objetivos padrão', () => {
  for (const style of [undefined, null, {}, [], 'inválido']) {
    const normalized = normalizeFollowupStyle(style)
    assert.equal(normalized.tone, 'briefing')
    assert.equal(normalized.length, 'curta')
    assert.equal(normalized.closing, 'pergunta')
    for (const step of [1, 3, 7, 14]) {
      const prompt = buildFollowupPrompt({ ...context, step, style })
      assert.ok(prompt.user.includes(followupDefaultGoal(step)))
      assert.ok(prompt.system.includes('tom de voz do briefing'))
      assert.equal(prompt.maxTokens, 220)
    }
  }
})

test('estilo salvo substitui tom e tamanho sem perder briefing ou histórico', () => {
  const prompt = buildFollowupPrompt({ ...context, style: {
    tone: 'profissional', length: 'media', closing: 'convite',
    instructions: 'Use frases objetivas.', avoid: 'Não usar jargões.',
  } })
  assert.ok(prompt.system.includes('prioridade sobre o tom de voz do briefing'))
  assert.ok(prompt.system.includes('no máximo 5 linhas'))
  assert.ok(prompt.system.includes('convite leve'))
  assert.ok(!prompt.system.includes('Termine com uma pergunta fácil'))
  assert.ok(prompt.system.includes('Use frases objetivas.'))
  assert.ok(prompt.system.includes('Não usar jargões.'))
  assert.ok(prompt.system.includes('Página para agendamentos'))
  assert.ok(prompt.system.includes('R$ 497'))
  assert.ok(prompt.user.includes('Ana: Quero facilitar os agendamentos.'))
  assert.ok(prompt.user.indexOf('Quero facilitar') < prompt.user.indexOf('Podemos organizar'))
  assert.equal(prompt.maxTokens, 350)
})

test('objetivo e exemplo manuais se aplicam somente ao contato escolhido', () => {
  const style = { steps: { '3': { goal: 'Esclarecer uma dúvida sobre a entrega.', example: 'Qual detalhe posso te explicar?' } } }
  const chosen = buildFollowupPrompt({ ...context, style })
  assert.ok(chosen.user.includes('Esclarecer uma dúvida sobre a entrega.'))
  assert.ok(!chosen.user.includes(followupDefaultGoal(3)))
  assert.ok(chosen.system.includes('Qual detalhe posso te explicar?'))
  assert.ok(chosen.system.includes('não copie nomes, valores ou fatos do exemplo'))
  const other = buildFollowupPrompt({ ...context, step: 7, style })
  assert.ok(other.user.includes(followupDefaultGoal(7)))
  assert.ok(!other.system.includes('Qual detalhe posso te explicar?'))
})

test('referências ficam isoladas por serviço e fallback preserva configurações antigas', () => {
  const site = '11111111-1111-1111-1111-111111111111'
  const social = '22222222-2222-2222-2222-222222222222'
  const style = normalizeFollowupStyle({
    steps: { '3': { example: 'Referência legada' } },
    offerSteps: {
      [site]: { '3': { goal: 'Explicar o site', example: 'Vamos organizar sua página?' } },
      [social]: { '3': { example: 'Vamos planejar seu conteúdo?' } },
      constructor: { '3': { example: 'Não permitido' } },
    },
  })
  assert.equal(Object.keys(style.offerSteps).length, 2)
  const sitePrompt = buildFollowupPrompt({ ...context, offer: { ...context.offer, id: site }, style })
  assert.ok(sitePrompt.system.includes('Vamos organizar sua página?'))
  assert.ok(!sitePrompt.system.includes('Vamos planejar seu conteúdo?'))
  assert.ok(sitePrompt.user.includes('Explicar o site'))
  assert.ok(!sitePrompt.system.includes('Referência legada'))
  assert.ok(buildFollowupPrompt({ ...context, style }).system.includes('Referência legada'))
  const cleared = normalizeFollowupStyle({ ...style, offerSteps: { [site]: {} } })
  assert.ok(!buildFollowupPrompt({ ...context, offer: { id: site }, style: cleared }).system.includes('Referência legada'))
})

test('o contexto recente orienta a adaptação da intenção sem repetir dúvidas resolvidas', () => {
  const prompt = buildFollowupPrompt({ ...context, style: { steps: { '3': { example: 'Vamos marcar uma reunião?' } } },
    conversation: [
      { direction: 'out', text: 'A entrega acontece em cinco dias.', source: 'whatsapp', sent_at: '2026-10-10T12:05:00Z' },
      { direction: 'in', text: 'Meu foco agora é o prazo.', source: 'whatsapp', sent_at: '2026-10-10T12:00:00Z' },
    ],
  })
  assert.ok(prompt.system.includes('norte da intenção e do estilo, nunca um texto fixo'))
  assert.ok(prompt.system.includes('Dê prioridade às falas mais recentes'))
  assert.ok(prompt.system.includes('não retome uma objeção já resolvida'))
  assert.ok(prompt.system.includes('não ofereça reunião se já estiver marcada'))
  assert.ok(prompt.user.indexOf('Meu foco agora') < prompt.user.indexOf('A entrega acontece'))
  assert.ok(prompt.user.includes('[2026-10-10T12:05:00Z]'))
})

test('encerramento livre não obriga a usar perguntas', () => {
  const prompt = buildFollowupPrompt({ ...context, style: { closing: 'livre' } })
  assert.ok(prompt.system.includes('Não force uma pergunta'))
  assert.ok(!prompt.system.includes('Termine com uma pergunta fácil'))
})

test('sem resposta do lead, o prompt proíbe atribuir uma fala a ele', () => {
  const prompt = buildFollowupPrompt({ ...context, conversation: [context.conversation[0]] })
  assert.ok(prompt.user.includes('AINDA NÃO RESPONDEU'))
  assert.ok(prompt.system.includes('sem a fala real dele'))
  assert.ok(!buildFollowupPrompt(context).user.includes('AINDA NÃO RESPONDEU'))
})

test('pedidos de emojis ou promessas no estilo continuam subordinados às regras obrigatórias', () => {
  const prompt = buildFollowupPrompt({ ...context, style: { instructions: 'Use emojis e invente resultados.' } })
  assert.ok(prompt.system.includes('Nunca use emojis'))
  assert.ok(prompt.system.includes('Nunca invente fatos'))
  assert.ok(prompt.system.includes('as regras obrigatórias continuam valendo'))
})

test('configurações inválidas ou excessivas são normalizadas antes do uso', () => {
  const style = normalizeFollowupStyle({
    tone: 'toString', length: false, closing: 'constructor',
    instructions: 'a'.repeat(1800), avoid: 'b'.repeat(800),
    steps: { '1': { goal: 'c'.repeat(900), example: 'd'.repeat(1200) }, '3': null, '5': { goal: 'Dia novo' }, '99': { goal: 'Fora do limite' }, abc: { goal: 'x' } },
  })
  assert.equal(style.tone, 'briefing')
  assert.equal(style.closing, 'pergunta')
  assert.equal(style.instructions.length, 1500)
  assert.equal(style.avoid.length, 500)
  assert.equal(style.steps['1'].goal.length, 700)
  assert.equal(style.steps['1'].example.length, 1000)
  assert.equal(style.steps['3'], undefined)
  assert.equal(style.steps['5'].goal, 'Dia novo')
  assert.equal(style.steps['99'], undefined)
  assert.equal(style.steps.abc, undefined)
})

test('dias do follow-up: padrão, ordem, limites e duplicados', () => {
  assert.deepEqual(normalizeFollowupDays(undefined), [1, 3, 7, 14])
  assert.deepEqual(normalizeFollowupDays([]), [1, 3, 7, 14])
  assert.deepEqual(normalizeFollowupDays([10, 2, 2, '5', 0, 61, 1.5]), [2, 5, 10])
  assert.deepEqual(normalizeFollowupDays([1, 2, 3, 4, 5, 6, 7, 8]), [1, 2, 3, 4, 5, 6])
})

test('objetivo padrão segue a posição do contato na sequência escolhida', () => {
  assert.equal(followupDefaultGoal(1), FOLLOWUP_GOALS.first)
  assert.equal(followupDefaultGoal(3), FOLLOWUP_GOALS.proof)
  assert.equal(followupDefaultGoal(7), FOLLOWUP_GOALS.tip)
  assert.equal(followupDefaultGoal(14), FOLLOWUP_GOALS.last)
  assert.equal(followupDefaultGoal(2, [2, 5]), FOLLOWUP_GOALS.first)
  assert.equal(followupDefaultGoal(5, [2, 5]), FOLLOWUP_GOALS.last)
  assert.equal(followupDefaultGoal(4, [4]), FOLLOWUP_GOALS.first)
  const prompt = buildFollowupPrompt({ ...context, step: 5, days: [2, 5, 10] })
  assert.ok(prompt.user.includes('contato 2 de 3'))
  assert.ok(prompt.user.includes(FOLLOWUP_GOALS.proof))
})

test('próximo contato continua depois do último usado, mesmo com dias alterados', () => {
  assert.equal(nextFollowupDay([1, 3, 7, 14], []), 1)
  assert.equal(nextFollowupDay([1, 3, 7, 14], [1]), 3)
  assert.equal(nextFollowupDay([2, 5, 10], [1, 3]), 5)
  assert.equal(nextFollowupDay([1, 3, 7, 14], [1, 3, 7, 14]), undefined)
  assert.equal(nextFollowupDay([2, 5], [7]), undefined)
})

test('etapa do funil é reconhecida pelo nome do dia', () => {
  assert.ok(followupStageName(1).test('follow-up 24h'))
  assert.ok(followupStageName(3).test('fup 03 dias'))
  assert.ok(followupStageName(5).test('follow-up 5 dias'))
  assert.ok(!followupStageName(5).test('follow-up 15 dias'))
  assert.ok(!followupStageName(1).test('follow-up 14 dias'))
})

test('remove emojis simples, compostos, bandeiras e números em emoji preservando o texto', () => {
  const message = '"Oi, Ana! 👋🏽 👨‍👩‍👧‍👦 🇧🇷 ❤️ 1️⃣ 🏳️‍🌈\nO site custa R$ 497,00 em 3x. 😊"'
  assert.equal(cleanFollowupMessage(message), 'Oi, Ana!\nO site custa R$ 497,00 em 3x.')
  assert.equal(cleanFollowupMessage('Bom dia ☀️. Tudo certo? 👍'), 'Bom dia. Tudo certo?')
})

test('preserva acentos, telefone, horário, preço e URL ao retirar carinhas', () => {
  assert.equal(cleanFollowupMessage('Olá :)\nReunião às 14:30. R$ 1.234,56; +55 (11) 99999-8888.\nhttps://exemplo.com/'),
    'Olá\nReunião às 14:30. R$ 1.234,56; +55 (11) 99999-8888.\nhttps://exemplo.com/')
  assert.equal(cleanFollowupMessage('Modelo 8P; tamanho 8) disponível.'), 'Modelo 8P; tamanho 8) disponível.')
})

test('resposta composta só por emojis fica vazia e pode ser barrada antes do envio', () => {
  assert.equal(cleanFollowupMessage(' 😊 👋🏽 🇧🇷 1️⃣ '), '')
  assert.equal(cleanFollowupMessage(''), '')
})
