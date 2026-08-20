/// <reference path="../.astro/types.d.ts" />

// Allow importing generated Mermaid sources as raw strings (Vite `?raw`).
declare module '*.mmd?raw' {
  const content: string;
  export default content;
}
