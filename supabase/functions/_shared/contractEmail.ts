// ── E-mail do contrato para assinatura ──────────────────────────────────────
// Usado por crm-contract-email. Com a marca da agência (logo e cor de
// CRM › Configurações), no mesmo papel claro das páginas públicas.

export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Texto legível por cima da cor da agência (mesma regra do PublicShell). */
function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#1C1917' : '#FFFFFF'
}

export interface Agency { name: string; logo: string | null; color: string | null }

export function buildContractEmail(a: { agency: Agency; firstName: string | null; title: string; link: string; agencySigned: boolean }) {
  const brand = a.agency.color && /^#[0-9A-Fa-f]{6}$/.test(a.agency.color) ? a.agency.color : '#2563EB'
  const onBrand = onColor(brand)
  const name = esc(a.agency.name)
  const logo = a.agency.logo && /^https:\/\//.test(a.agency.logo)
    ? `<img src="${esc(a.agency.logo)}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:22px;object-fit:cover;">`
    : `<div style="width:44px;height:44px;border-radius:22px;background:${brand};color:${onBrand};font:bold 18px/44px Arial,Helvetica,sans-serif;text-align:center;">${esc(a.agency.name.slice(0, 1).toUpperCase())}</div>`
  const hi = a.firstName ? `Olá, ${esc(a.firstName)}!` : 'Olá!'

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(a.title)}</title></head>
<body style="margin:0;padding:0;background:#F6F4EF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F6F4EF"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:560px;background:#FFFFFF;border:1px solid #E4DFD6;border-radius:14px;overflow:hidden;">
<tr><td style="height:6px;background:${brand};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 32px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:12px;">${logo}</td>
    <td style="font:bold 17px/22px Arial,Helvetica,sans-serif;color:#1C1917;">${name}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 32px 8px;font-family:Arial,Helvetica,sans-serif;color:#1C1917;">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6B645C;">Contrato para assinatura</p>
  <h1 style="margin:0 0 18px;font-size:24px;line-height:30px;font-weight:bold;">${esc(a.title)}</h1>
  <p style="margin:0 0 12px;font-size:15px;line-height:23px;">${hi}</p>
  <p style="margin:0 0 12px;font-size:15px;line-height:23px;">A <strong>${name}</strong> enviou o contrato para você conferir e assinar.${a.agencySigned ? ' Ele já está assinado pela agência e falta só a sua assinatura.' : ''}</p>
  <p style="margin:0 0 24px;font-size:15px;line-height:23px;">É só abrir o link, ler com calma e assinar com o dedo, pelo celular mesmo. Leva menos de dois minutos.</p>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${brand};">
    <a href="${esc(a.link)}" style="display:inline-block;padding:14px 26px;font:bold 15px Arial,Helvetica,sans-serif;color:${onBrand};text-decoration:none;border-radius:10px;">Revisar e assinar o contrato</a>
  </td></tr></table>
  <p style="margin:24px 0 4px;font-size:12px;line-height:18px;color:#6B645C;">Se o botão não abrir, copie este endereço no navegador:</p>
  <p style="margin:0 0 20px;font-size:12px;line-height:18px;word-break:break-all;"><a href="${esc(a.link)}" style="color:${brand};">${esc(a.link)}</a></p>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #E4DFD6;font:12px/18px Arial,Helvetica,sans-serif;color:#6B645C;">
  Assinatura eletrônica com registro de nome, documento, e-mail, data, hora e endereço de acesso. Ficou com dúvida? É só responder este e-mail.
</td></tr>
</table>
<p style="margin:14px 0 0;font:12px Arial,Helvetica,sans-serif;color:#6B645C;">Enviado por ${name} via StatusMedia</p>
</td></tr></table></body></html>`
}
