# api

El cliente HTTP único y tipado. Ninguna pantalla llama a `fetch`
directamente: todas pasan por aquí.

| Archivo | Qué hace |
|---|---|
| `tipos.ts` | El contrato de la API, escrito una sola vez |
| `errores.ts` | `ErrorDeApi`: el único error que sale de esta capa |
| `cliente-http.ts` | `pedir()`: token, tiempo máximo, sobre de respuesta, 401 y errores |
| `acceso.ts` | `entrar`, `salir` y `yo` |

## Lo que resuelve `pedir()`

- Pone la dirección de la API (`VITE_API_URL`) y quita la barra final.
- Manda el token en `Authorization: Bearer …`; **nunca** por la dirección.
- Corta a los 15 segundos y avisa, en vez de dejar la pantalla cargando para
  siempre.
- Quita el sobre `{ ok, datos }` y devuelve solo `datos`.
- Convierte cualquier fallo en un `ErrorDeApi` con un mensaje en español.
- Si el servidor responde 401 `SIN_SESION` **y se había mandado un token**,
  avisa para volver a la pantalla de entrar. Un 401 al escribir mal la clave
  no cuenta: ese mensaje se muestra en el formulario.

## Cómo probarlo

```bash
npm run test:web
```

Las pruebas del cliente sustituyen `fetch` por una respuesta preparada: lo que
se comprueba es **nuestro** cliente (que mande el token, que lea el sobre, que
arme bien los errores). Que el servidor responda bien de verdad lo comprueban
las 157 pruebas del servidor contra PostgreSQL.
