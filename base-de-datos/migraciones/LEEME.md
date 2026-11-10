# Migraciones

Aquí van los cambios del esquema, un archivo SQL numerado por cambio. **Ya está
lleno** (Fase 1 terminada; la Fase 2 agregó la matriz de permisos).

## Orden de aplicación

Se aplican por nombre, y como los nombres van numerados con ceros a la izquierda,
el orden alfabético es el orden numérico.

| Archivo | Qué hace |
|---|---|
| `001_tipos_y_dominios.sql` | Los ENUM y los dominios `dinero`, `cantidad`, `porcentaje` |
| `002_tablas.sql` | Las 41 tablas con sus llaves y restricciones |
| `003_indices.sql` | Los índices |
| `004_disparadores.sql` | Los disparadores |
| `005_funciones_de_negocio.sql` | Las funciones de negocio |
| `006_vistas.sql` | Las vistas de consulta |
| `007_correcciones_de_la_auditoria.sql` | Correcciones de la sección 7 del plan |
| `008_catalogos_del_sistema.sql` | Los 8 roles y las operaciones del sistema |
| `009_correcciones_de_la_fase_1.sql` | Defecto encontrado por las pruebas de la Fase 1 |
| `010_proveedor_y_empleado_no_se_borran.sql` | Los disparadores que le faltaban a la RN-16 |
| `011_matriz_de_permisos.sql` | La matriz de permisos que aprobó el dueño (216 casillas) |
| `012_nombres_del_catalogo_sin_mayusculas.sql` | Nombres de producto sin distinguir mayúsculas ni tildes |
| `013_ajuste_de_inventario_con_diferencia.sql` | El ajuste por conteo acepta cualquier diferencia distinta de cero |
| `014_permiso_reportar_agotado.sql` | La operación 28: `REPORTAR_AGOTADO`, para dueño, gerente y cocina |

## Las reglas del juego

1. **Una migración aplicada no se edita.** Si hay que cambiar algo, se agrega un
   archivo nuevo con el número siguiente. El migrador guarda la huella SHA-256 de
   cada archivo y se detiene si uno ya aplicado cambió. Hay una migración
   (`011_matriz_de_permisos.sql`) con una prueba que se apoya en esto: lee la tabla
   de `docs/reglas-de-negocio.md` y la compara contra la base, así que si se edita
   una casilla hay que tocar los dos lados y el documento manda.
2. Cada migración lleva en su encabezado **qué hace, de qué depende y de dónde
   salió**.
3. Las migraciones `001` a `006` se copiaron **tal cual** del script del profesor
   (`siga-dp-prototipo/base de datos/siga_dp_postgresql.sql`), por programa y no a
   mano. No se editan: los ajustes van en una migración nueva.

## Cómo se aplican

```bash
npm run base:migrar    # aplica las pendientes
npm run base:estado    # muestra qué está aplicado y qué falta
npm run base:crear     # crea las bases desde cero y aplica todo
```
