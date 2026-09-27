declare const __BUILD__: { version: string; sha: string; time: string };

interface ImportMetaEnv {
  readonly VITE_CLOUDKIT_API_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
