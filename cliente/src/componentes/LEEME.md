# componentes

Las piezas que se repiten. Ninguna habla con la API: reciben datos y avisan
hacia arriba, para que se puedan probar sueltas.

| Componente | Para qué |
|---|---|
| `Boton.tsx` | Botón con variantes. Mientras `cargando` está deshabilitado y lo dice: eso evita el doble clic |
| `Campo.tsx` | Etiqueta + casilla + ayuda/error, enlazados para el lector de pantalla |
| `Alerta.tsx` | Error, éxito, aviso e información. El error se anuncia como `alert`; lo demás, como `status` |
| `Tabla.tsx` | Tabla con nombre accesible, encabezados, estado vacío y estado cargando |
| `Cargando.tsx` | El aviso de que el sistema está trabajando |
| `Logo.tsx` | El logo real del asadero; si la imagen falta, cae en "DP" sin dejar un hueco roto |
| `Insignia.tsx` | Una etiqueta corta para un estado ("Fase 4", "Activo", "Ocupada") |
| `EncabezadoPagina.tsx` | El rótulo, el título y el subtítulo de cada pantalla |
| `TarjetaModulo.tsx` | La tarjeta grande del inicio: icono, nombre, descripción y fase |
| `RutaProtegida.tsx` | La guarda: exige sesión y, si se le pide, un permiso |
| `LayoutPrincipal.tsx` | El marco de las pantallas de dentro: barra lateral oscura, cabecera y salir |

## La identidad

Los colores y la tipografía no se escriben en cada pantalla: están en
`src/estilos/index.css` (`@theme`), con la paleta del prototipo —carbón, brasa,
ladrillo, miel, crema, madera, hoja y pizarra— y Poppins. El logo y la mascota
están en `public/imagenes/`.

## La regla de la guarda

`RutaProtegida` es comodidad, **no** seguridad. El servidor vuelve a comprobar el
permiso en cada petición contra `rol_permiso`. Que una ruta no se abra en el
navegador no protege nada por sí solo.
