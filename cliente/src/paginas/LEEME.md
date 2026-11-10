# páginas

Una pantalla por archivo. Toda pantalla que guarde llama a la API real (regla de
oro 1).

| Pantalla | Ruta | Qué hace |
|---|---|---|
| `PantallaLogin.tsx` | `/entrar` | Entrar contra `POST /api/acceso/entrar`; panel de marca con la mascota en pantallas grandes |
| `Inicio.tsx` | `/` | Saludo por hora, tu rol y una tarjeta por pantalla que puedes abrir |
| `EnConstruccion.tsx` | cada módulo | Dice en qué fase llega el módulo; no finge funcionar |
| `SinPermiso.tsx` | `/sin-permiso` | Explica el 403 y ofrece volver |
| `NoEncontrada.tsx` | cualquiera | Explica el 404 y ofrece volver |

`Inicio` no muestra números inventados: solo datos que devolvió el servidor
(nombre, rol, vencimiento) y el catálogo de `modulos.ts` filtrado por permisos.
El saludo cambia según la hora y usa el primer nombre.

**Fase 4 en adelante:** cada pantalla "en construcción" se reemplaza por la de
verdad. La ruta y la guarda ya están puestas.
