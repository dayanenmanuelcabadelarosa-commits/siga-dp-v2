# Datos de desarrollo

Aquí van los datos mínimos para poder trabajar. **Ya está lleno** (Fase 1
terminada).

Solo hay un archivo, `001_desarrollo.sql`, con:

- El local y su **tasa de impuesto** (18 %).
- Las secuencias de comprobantes `B01` y `B02`.
- Una zona, una mesa, una estación de cocina, una categoría, una unidad de medida
  y un punto de acceso.
- Un **empleado gerente** con su cuenta: usuario `gerente`, clave `gerente`.
- Dos productos provisionales.

Todo está rotulado como desarrollo en el propio archivo.

## Lo que nunca va aquí

- Datos de negocio reales.
- Datos de ejemplo repartidos por el código (regla de oro 2).
- **Los roles y los permisos**: esos son parte del modelo del sistema y viven en
  la migración `008_catalogos_del_sistema.sql`, porque sin ellos no se puede
  autorizar nada.

## La clave del gerente

El archivo **no** lleva la clave escrita. Lleva la marca `{{CLAVE_HASH}}` y la
herramienta `servidor/herramientas/semilla.js` la sustituye por un hash de `scrypt`
calculado en ese momento. Así no hay ni una contraseña en texto plano ni un hash
inventado a mano.

```bash
npm run base:semilla                          # clave de desarrollo: gerente
npm run base:semilla -- --clave otra-clave    # otra clave
```
