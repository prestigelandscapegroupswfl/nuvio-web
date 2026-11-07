/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** LUMIÈRE: fanart.tv API key for character art. Optional; unset disables it. */
  readonly VITE_FANART_API_KEY?: string;
  readonly VITE_NUVIO_SUPABASE_URL: string;
  readonly VITE_NUVIO_SUPABASE_FALLBACK_URL: string;
  readonly VITE_NUVIO_SUPABASE_ANON_KEY: string;
}

declare const __APP_BUILD__: string;
declare const __APP_VERSION__: string;
