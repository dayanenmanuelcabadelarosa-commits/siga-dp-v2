# acceso

Quién entra, cómo se comprueba y qué puede hacer.

## Qué hay hoy (Fase 1 y Fase 2)

| Archivo | Qué hace |
|---|---|
| `claves.js` (Fase 1) | Cifrar y verificar contraseñas con `scrypt`, en el formato `sal$hash`. Nunca en texto plano; la comparación es en tiempo constante |
| `sesion.js` (Fase 2) | Firmar y comprobar el token (`HMAC-SHA256` con `CLAVE_SESION`) |
| `autenticacion.js` (Fase 2) | El ingreso con el bloqueo de la RN-24, y las consultas `sesionDe`, `puede` y `permisosDe` |
| `middleware.js` (Fase 2) | `requiereSesion` (401) y `requierePermiso(codigo)` (403) |

## Tres cosas que conviene recordar

1. **El token solo lleva el identificador del usuario.** El rol, los permisos y si
   la cuenta sigue activa se leen de la base en cada petición. Por eso dar de baja
   a alguien surte efecto en el acto (RN-23).
2. **El token viaja solo en el encabezado `Authorization`.** Nunca por la barra de
   direcciones (lo manda la auditoría, sección 7 del plan).
3. **Se niega por defecto.** `puede()` pregunta a la tabla `rol_permiso`; si la
   matriz está vacía, la respuesta es no. Ni siquiera el dueño tiene permiso
   automático.

## Lo que falta

- Llenar la matriz `rol_permiso` cuando el dueño apruebe la propuesta
  (`docs/reglas-de-negocio.md`, sección 4.5).
- Invalidar el token de verdad al cerrar sesión (decisión 19): hoy el cliente lo
  tira y ya. Necesitaría una tabla de sesiones.

**Fase 1 y Fase 2.**
