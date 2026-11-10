/*
  Variables de entorno del cliente, con sus tipos.

  `vite/client` ya declara `import.meta.env` con un índice abierto, pero eso
  deja `VITE_API_URL` como `any`. Al declararla aquí, TypeScript sabe que puede
  ser un texto o no venir, y obliga a comprobarlo antes de usarla.
*/

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección de la API. Ejemplo: http://localhost:4000 */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
