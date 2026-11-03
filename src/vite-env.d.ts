/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // App ID público da Meta, usado para montar a URL de Business Login for
  // Instagram (src/lib/instagramOAuth.ts). O secret nunca vem para o frontend.
  readonly VITE_META_APP_ID?: string
  // VITE_OPENAI_API_KEY removida — chave OpenAI usada somente via Supabase Secrets (Edge Functions)
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Versão do sistema (vite.config.ts → define)
declare const __APP_BUILD__: string
declare const __APP_DATE__: string
