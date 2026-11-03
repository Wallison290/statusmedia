// Versão do sistema mostrada no pé do menu (agência e portal do cliente).
// O número é a contagem de commits do repositório (vite.config.ts); a data é
// a do build, ou seja, quando esta versão foi publicada.
export const APP_VERSION = `v${__APP_BUILD__}`

export const APP_VERSION_TITLE = (() => {
  const d = new Date(__APP_DATE__)
  const quando = isNaN(d.getTime()) ? '' : ` · publicada em ${d.toLocaleDateString('pt-BR')}`
  return `Versão ${__APP_BUILD__}${quando}`
})()
