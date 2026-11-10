# validaciones

Esquemas de Zod. La validación de entrada es obligatoria en toda ruta que reciba
datos (regla de oro 6).

## Qué hay hoy (Fase 2)

| Archivo | Qué trae |
|---|---|
| `validar.js` | El middleware `validar(esquema)`: revisa y deja el resultado en `req.datos` |
| `acceso.js` | El esquema del ingreso (usuario y clave) |

Si algo no pasa, la ruta **no se ejecuta**: se responde 400 con
`{ ok: false, error: { codigo: "DATOS_INVALIDOS", mensaje } }`, y el mensaje está
en español y se puede mostrar en pantalla.

## Los mensajes se escriben aquí

Zod arma el mensaje con lo que diga cada regla, así que **los textos de error se
escriben en el esquema**, no en la ruta:

```js
nombre: z.string({ error: "Escribe el nombre del producto." })
          .trim()
          .min(1, "El nombre no puede quedar vacío.")
```

## Lo que falta

Un archivo por módulo, a medida que se construyan (Fase 4 en adelante): personal,
productos, reservas, descuentos, movimientos de inventario...

**Fase 2 y Fase 4 en adelante.**
