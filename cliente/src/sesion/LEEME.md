# sesion

Quién está dentro del sistema y qué puede hacer.

| Archivo | Qué hace |
|---|---|
| `almacen.ts` | Guarda el token en `sessionStorage` (y lo lee con desconfianza) |
| `contexto.ts` | El molde del contexto: estado, usuario, permisos, `entrar`, `salir`, `puede` |
| `ContextoSesion.tsx` | El proveedor: pide `/api/acceso/yo`, atiende la expiración y el cierre |
| `useSesion.ts` | El hook que usan las pantallas |

## Por qué `sessionStorage` y no `localStorage`

- Aguanta recargar la página, que es lo que se necesita en el servicio.
- Muere al cerrar la pestaña: en una tablet compartida, nadie hereda la sesión
  del turno anterior.
- No se comparte entre pestañas. Es una molestia menor a cambio de no dejar
  sesiones abiertas de más.

Si el dueño prefiere que la sesión se recuerde al cerrar el navegador, se cambia
solo `almacen.ts`. El resto del cliente no sabe dónde se guarda.

## De dónde salen los permisos

**Nunca de una lista escrita en el cliente.** Los devuelve
`GET /api/acceso/yo`, que los lee de la matriz `rol_permiso` en PostgreSQL. Si
al empleado le cambian el rol, al recargar la página se entera; si lo dan de
baja, la siguiente petición recibe 401 y aquí se cierra la sesión.

## Qué pasa cuando algo falla

- **Token vencido al abrir la página:** se borra y se avisa en el login ("Tu
  sesión venció").
- **El servidor responde 401 `SIN_SESION` con un token puesto:** el cliente HTTP
  avisa, y el proveedor borra el token y vuelve a "anónimo". Una sola vez, en un
  solo lugar.
- **Falla la red al salir:** la sesión se cierra igual aquí. Salir no puede
  depender de que el servidor esté despierto.
