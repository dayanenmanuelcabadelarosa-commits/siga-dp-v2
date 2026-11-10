# db

Conexión con PostgreSQL y la utilidad de transacciones. La base de datos es la
fuente única de verdad (regla de oro 5): los totales y las reglas del negocio se
calculan aquí, no en JavaScript.

## Qué hay hoy

- **`conexion.js`** (Fase 1): el grupo de conexiones, las consultas
  (`consultar`, `consultarUno`, `consultarNumero`), `conTransaccion` y el cierre
  ordenado. Los montos (`NUMERIC`) y los enteros grandes (`BIGINT`) llegan a
  JavaScript como números, no como texto.

  El "quién opera" para la bitácora se fija **dentro de la transacción**, con
  `set_config('app.usuario', …, true)`, no en una variable del módulo. El
  prototipo lo tenía en una variable del módulo, y eso era una carrera de verdad:
  con dos peticiones a la vez, la bitácora podía acabar atribuyendo el trabajo al
  usuario equivocado.

  Nota sobre la base de pruebas: el grupo se arma con `BD_NOMBRE` del entorno. Las
  pruebas le ponen `BD_NOMBRE = <base>_pruebas` (ver `vitest.config.js`), y por eso
  nunca escriben en la base de trabajo.

## Lo que falta

- Los servicios por módulo (Fase 4 en adelante): cada uno usa `conTransaccion`
  para que una operación salga entera o no salga.

**Fase 1 (conexión) y Fase 4 en adelante (servicios).**
