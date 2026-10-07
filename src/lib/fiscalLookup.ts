// Busca de dados públicos para preencher cadastro fiscal sem digitar:
//   • CNPJ → razão social e endereço (BrasilAPI, dados abertos da Receita)
//   • CEP  → endereço (ViaCEP)
// Ambas gratuitas e sem chave. Falhou? Retorna null e a pessoa digita.

export const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function formatDocument(d: string | null | undefined) {
  const n = onlyDigits(d)
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d ?? ''
}

export function formatCep(c: string | null | undefined) {
  const n = onlyDigits(c)
  return n.length === 8 ? `${n.slice(0, 5)}-${n.slice(5)}` : (c ?? '')
}

export interface CnpjData {
  legal_name: string; email: string | null
  zip: string; street: string; number: string; complement: string; district: string; city: string; state: string
}

export async function lookupCnpj(cnpj: string): Promise<CnpjData | null> {
  const n = onlyDigits(cnpj)
  if (n.length !== 14) return null
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${n}`)
    if (!res.ok) return null
    const d = await res.json()
    return {
      legal_name: d.razao_social ?? '',
      email: d.email ? String(d.email).toLowerCase() : null,
      zip: onlyDigits(d.cep),
      // O tipo ("RUA", "QUADRA") às vezes já vem dentro do logradouro
      street: d.descricao_tipo_de_logradouro && !String(d.logradouro ?? '').toUpperCase().includes(String(d.descricao_tipo_de_logradouro).toUpperCase())
        ? `${d.descricao_tipo_de_logradouro} ${d.logradouro ?? ''}`.trim()
        : (d.logradouro ?? ''),
      number: d.numero ?? '',
      complement: d.complemento ?? '',
      district: d.bairro ?? '',
      city: d.municipio ?? '',
      state: d.uf ?? '',
    }
  } catch {
    return null
  }
}

export async function lookupCep(cep: string) {
  const n = onlyDigits(cep)
  if (n.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${n}/json/`)
    if (!res.ok) return null
    const d = await res.json()
    if (d.erro) return null
    return { street: d.logradouro ?? '', district: d.bairro ?? '', city: d.localidade ?? '', state: d.uf ?? '' }
  } catch {
    return null
  }
}
