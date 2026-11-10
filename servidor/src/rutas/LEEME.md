# rutas

Una ruta de Express por módulo. Cada una valida su entrada con Zod y verifica el
permiso con `requierePermiso`.

## Qué hay hoy (Fase 2)

| Archivo | Ruta | Quién |
|---|---|---|
| `acceso.js` | `/api/acceso` (entrar, salir, yo) | entrar es libre; el resto pide sesión |
| `parametros.js` | `/api/parametros` | permiso `ADMINISTRAR_PARAMETROS` |
| `index.js` | monta todas bajo `/api` | — |

## La regla de cada ruta nueva

1. **Validar lo que entra** con `validar(esquema)` y usar `req.datos` (nunca
   `req.body` a pelo).
2. **Verificar el permiso** con `requiereSesion` + `requierePermiso("...")`. Va
   siempre, aunque la ruta parezca inofensiva.
3. **Responder con `exito(res, datos)`** y **lanzar `ErrorDeApi`** para los errores.
   Nada de `res.json` armado a mano.
4. **Envolver la función async con `asyncHandler`**, como pide el plan.

## Lo que falta

Los módulos de gestión (Fase 4): personal, catálogo, salón, inventario, reservas...
y los de operación (Fase 5) y caja (Fase 6).

**Fase 2 (acceso y parámetros) y Fase 4 en adelante (el resto).**
