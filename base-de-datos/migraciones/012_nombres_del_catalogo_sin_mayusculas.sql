/*
  012_nombres_del_catalogo_sin_mayusculas.sql
  ------------------------------------------

  Los nombres de productos, categorías y estaciones ya eran únicos, pero solo
  distinguiendo mayúsculas y minúsculas. Para el local, "Pollo a la brasa" y
  "POLLO A LA BRASA" son el mismo plato, y "Piña" y "PIÑA" también.

  Esta migración agrega una función pequeña que lleva un nombre a una forma
  comparable: minúsculas y sin tildes. Con ella se crean tres índices únicos.
  La base pasa a ser la que impide el duplicado, no solo la pantalla.

  Por qué se hace con `translate` y no con `lower` a secas: la base usa la
  colación "C", que solo pasa a minúsculas las letras sin tilde. `lower('Á')`
  sigue siendo 'Á' en esta configuración. `translate` quita primero la tilde y
  así las comparaciones cubren el español que se usa en el negocio.

  Los índices no reemplazan a las restricciones únicas que ya existían: las
  complementan. Una migración aplicada no se edita; si algún día hace falta
  cubrir más caracteres, se agrega otra migración.
*/

CREATE OR REPLACE FUNCTION fn_nombre_normalizado(texto TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT lower(
    translate(
      texto,
      'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
      'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc'
    )
  );
$$;

COMMENT ON FUNCTION fn_nombre_normalizado(TEXT) IS
  'Nombre en minúsculas y sin tildes, para comparar nombres del catálogo.';

CREATE UNIQUE INDEX uq_producto_nombre_normalizado
  ON producto (fn_nombre_normalizado(nombre));

CREATE UNIQUE INDEX uq_categoria_nombre_normalizado
  ON categoria (fn_nombre_normalizado(nombre));

CREATE UNIQUE INDEX uq_estacion_nombre_normalizado
  ON estacion (fn_nombre_normalizado(nombre));
