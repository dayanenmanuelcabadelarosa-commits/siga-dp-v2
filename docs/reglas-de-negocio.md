# Reglas de negocio — SIGA-DP v2

> **Estado:** revisado en la Fase 1 (ver la sección 2.5 con las verificaciones).
>
> Las reglas RN-01 a RN-28 se extrajeron del documento de análisis del prototipo
> (*"Análisis de procesos y entidades — SIGA-DP"*) y se contrastaron con el script
> `siga_dp_postgresql.sql` del prototipo, que está en `siga-dp-prototipo/`.
>
> **Aviso de exactitud:** la columna "dónde vive" dice lo que hace el prototipo
> hoy. En la Fase 1 cada objeto se revisó contra la base real y **cada regla tiene
> una prueba automática que intenta violarla** (ver `servidor/pruebas/`). Lo que
> no cuadró se corrigió y quedó anotado en la sección 2.5.

---

## 1. Cómo se usa este documento

- La base de datos es la **fuente única de verdad** (regla de oro 5). Una regla
  que se pueda expresar como `CHECK`, `UNIQUE` o trigger **se pone en
  PostgreSQL**, no en JavaScript.
- En la Fase 1, cada regla lleva **una prueba que intente violarla** y compruebe
  que falla como se espera. La columna "prueba de la Fase 1" del listado de
  abajo apunta qué hay que demostrar.
- Si una regla no está clara, **se pregunta al dueño antes de implementarla**
  (regla de oro 8). Las dudas abiertas están en la sección 5.

### Nota sobre la numeración

El PDF del plan habla de "RN-01 a RN-26", pero los documentos de análisis del
proyecto definen **RN-01 a RN-28**. Las dos reglas que faltan son RN-27 y
RN-28. Se conservan las 28; el número real se confirmará con el dueño.

---

## 2. Las reglas

### RN-01 — Un pedido abierto por mesa

- **Regla:** un pedido abierto pertenece a una sola mesa, y una mesa no tiene
  dos pedidos abiertos.
- **Entidad:** `pedido`.
- **Dónde vive:** índice único parcial `uq_pedido_abierto_por_mesa`
  (`ON pedido (id_mesa) WHERE estado = 'Abierto'`).
- **Prueba de la Fase 1:** abrir dos pedidos en la misma mesa falla con `23505`.

### RN-02 — El precio y el nombre se copian

- **Regla:** el precio y el nombre del producto se copian en la línea al pedir y
  al facturar; un cambio posterior no altera lo ya vendido.
- **Entidad:** `linea_pedido`, `linea_cuenta` (y `linea_comprobante`).
- **Dónde vive:** columnas `descripcion` y `precio_unitario` en la línea. No hay
  constraint: se respeta al insertar.
- **Prueba de la Fase 1:** cambiar el precio del producto después de venderlo y
  comprobar que la línea histórica mantiene el precio original.

### RN-03 — El mesero de la orden recibe la propina

- **Regla:** el mesero de una orden es el primero que abre el pedido; ese nombre
  es el que recibe la propina.
- **Entidad:** `pedido`, `mesa`, `propina`.
- **Dónde vive:** `pedido.id_mesero` y `mesa.id_mesero_orden`.
- **Prueba de la Fase 1:** la propina registrada apunta al mesero del pedido.

### RN-04 — Una propina por mesa y empleado y día

- **Regla:** una propina solo se registra sobre una mesa cuya orden tomó quien
  la registra; no se repite el mismo empleado, la misma mesa y el mismo día.
- **Entidad:** `propina`.
- **Dónde vive:** índice único `uq_propina_por_mesa`, sobre
  `(id_empleado, id_mesa, (registrada_en AT TIME ZONE 'America/Santo_Domingo')::date)`
  con `WHERE id_mesa IS NOT NULL`.
- **Ojo:** el índice lleva `id_empleado` **y** `id_mesa`. Si solo llevara mesa y
  fecha, dos meseros distintos de la misma mesa no podrían cobrar propina.
- **Contradicción detectada:** el enunciado de la regla dice que la propina solo
  se registra sobre una mesa cuya orden tomó quien la registra, pero el índice
  del prototipo sí admite que dos empleados distintos registren propina en la
  misma mesa el mismo día. Las dos cosas no pueden ser ciertas a la vez.
  **Decisión pendiente** (ver sección 5, punto 11).
- **Cómo se implementó en la Fase 5:** `POST /api/propinas` busca un pedido de
  esa mesa abierto hoy cuyo `id_mesero` sea el empleado de la sesión. Si no
  existe, responde `403 SIN_PERMISO`; la pantalla ni siquiera ofrece mesas
  ajenas. La comprobación está en el servidor, no solo en el cliente. Queda
  pendiente la decisión del dueño sobre la contradicción de arriba.

### RN-05 — Una cuenta por mesa

- **Regla:** una cuenta se genera una sola vez por mesa; al generarla el consumo
  queda congelado.
- **Entidad:** `cuenta`.
- **Dónde vive:** índice único parcial `uq_cuenta_abierta_por_mesa`
  (`WHERE estado = 'Abierta'`) y `fn_generar_cuenta(id_mesa)`, que es idempotente:
  si ya hay cuenta abierta, devuelve la que hay en vez de crear otra.
- **Prueba de la Fase 1:** llamar dos veces a `fn_generar_cuenta` sobre la misma
  mesa devuelve el mismo `id_cuenta`.
- **Pendiente de decidir:** `fn_generar_cuenta` copia solo las líneas en estado
  `Enviada` y **no avisa** si el pedido tiene líneas sin enviar: genera una cuenta
  con cero líneas y total RD$ 0. En el prototipo eso se corrigió en la ruta de la
  API devolviendo `409`. **Decisión para la Fase 1:** ¿se corrige en la función
  de la base (que lance excepción) o se mantiene la comprobación en la ruta?

### RN-06 — Una cuenta pagada no se toca

- **Regla:** una cuenta pagada no se modifica ni se vuelve a cobrar.
- **Entidad:** `cuenta`, `pago`.
- **Dónde vive:** `ck_cuenta_cierre`, `fn_cobrar_cuenta` y el índice
  `uq_pago_cuenta_completo` (una cuenta admite **un solo cobro completo**, el
  pago sin comensal).
- **Desde la migración `022` la cuenta se puede dividir (cobro por comensal):**
  cuando la cuenta está dividida en `asignacion_persona`, cada comensal paga su
  parte con `fn_cobrar_comensal` y queda un `pago` por comensal
  (`uq_pago_comensal`). La regla se conserva partida en dos: **un** cobro completo
  por cuenta y **un** cobro por comensal. La cuenta se cierra sola
  (`estado = 'Pagada'`) cuando lo cobrado cubre el total, y a partir de ahí no se
  vuelve a cobrar. Mientras la cuenta está dividida, `fn_cobrar_cuenta` rechaza
  el cobro completo y lo dice.
- **El cambio descuenta la propina (migración `018`):** lo que hay que cobrar es
  el total de la cuenta **más** la propina. Antes el cambio se calculaba solo
  contra el total y la propina se comía el vuelto. Ejemplo: cuenta de RD$ 350,
  propina de RD$ 50, el cliente da RD$ 400; el cambio correcto es RD$ 0.
- **Con tarjeta, PayPal o crédito** lo que se cobra es ese total más la propina;
  el cajero no tiene que escribir un número. Solo el efectivo lleva un campo
  "recibido", y de ahí sale el cambio.
- **La propina lleva su propia referencia (RN-28, migración `024`):** la
  autorización de la tarjeta se guarda en el pago, y la propina se anota con
  `COBRO-<cuenta>` (o `COBRO-<cuenta>-<comensal>` cuando el cobro es por
  comensal).

### RN-07 — Descuentos y cortesías con autorizante

- **Regla:** ningún descuento se guarda sin la autorización de un capitán, y una
  cortesía sin la del dueño.
- **Entidad:** `descuento`.
- **Dónde vive:** `descuento.id_autorizado_por` es `NOT NULL` (`FK` a `empleado`).
  El **rol** del autorizante se comprueba en el servidor.
- **Pendiente de decidir:** el prototipo valida el rol en la ruta. ¿Debe además
  existir un trigger que verifique el rol del autorizante en la base? Y ¿cuál es
  el **tope máximo** de un descuento? (el plan lo exige en la Fase 6, sección 7).

### RN-08 — El número fiscal no se reutiliza

- **Regla:** el número fiscal no se repite ni se reutiliza después de anular; la
  secuencia avanza siempre.
- **Entidad:** `comprobante`, `secuencia_ncf`.
- **Dónde vive:** `trg_numerar_comprobante` (toma el número de la secuencia dentro
  de la misma transacción), `uq_comprobante_ncf` y `ck_secuencia_coherente`
  (`siguiente_numero = ultimo_numero + 1`). `fn_anular_comprobante` no devuelve el
  número a la secuencia.
- **Desde la Fase 8 el número lo asigna la plataforma de la DGII:** al mandarle
  el comprobante **sin** `eNCF`, ella devuelve el siguiente del rango
  configurado en su panel (`E31…` o `E32…`). Ese número es el que se guarda en
  `comprobante.numero_ncf` y el que ve el cliente. La secuencia local solo se
  usa si algún camino emite sin pasar por la plataforma, y el disparador respeta
  el número que venga puesto.
- **Desde la migración `022` el comprobante cuelga de un cobro, no de la cuenta:**
  `comprobante.id_pago` apunta al `pago` que lo originó y el índice
  `uq_comprobante_por_pago` impide que un mismo cobro tenga dos comprobantes.
  Una cuenta dividida emite un comprobante por comensal; una cuenta normal
  sigue con un solo comprobante.

### RN-09 — Anular no es borrar

- **Regla:** un comprobante anulado no se borra: cambia de estado y se guarda
  quién y cuándo lo anuló.
- **Entidad:** `comprobante`.
- **Dónde vive:** `ck_comprobante_anulacion` (`Anulado` exige `anulado_en` no
  nulo) y las columnas `id_anulado_por` / `anulado_en`.

### RN-10 — El impuesto se calcula con la tasa vigente

- **Regla:** la base imponible y el impuesto de un comprobante se calculan con la
  tasa vigente al momento de emitir.
- **Entidad:** `comprobante`, `parametro`.
- **Dónde vive:** `fn_emitir_comprobante` (calcula el impuesto sobre lo
  efectivamente cobrado) y `ck_comprobante_totales` (`total = base + impuesto`).
- **PayPal cobra en dólares (Fase 8):** la cuenta del local está en pesos, así
  que el monto se convierte con `parametro.tasa_cambio_usd` (cuántos pesos vale
  un dólar), que escribe el dueño. La tasa queda congelada en el cobro
  (`pago_paypal.tasa_cambio`) y la venta se registra en la base **en pesos**:
  el corte de caja y los comprobantes siguen hablando el idioma del local.
- **Desde la Fase 8 (20 de octubre de 2026) el JSON lo arma la plataforma:** las
  líneas van **sin ITBIS** ("Precio unitario SIN ITBIS", según la documentación
  del E32 de la plataforma), aunque en el local los precios lo lleven dentro. El
  gravado sale hacia atrás del total de la cuenta (`base = total / (1 + tasa/100)`)
  y se reparte entre las líneas sin perder centavos. A partir de **RD$250,000**
  el RNC del comprador es obligatorio (por debajo es opcional y el comprobante
  sale como RFCE). La comida del asadero va como **servicio** (código 2).

### RN-11 — Un corte por fecha

- **Regla:** no puede haber dos cortes de caja para la misma fecha; un corte
  cerrado solo lo reabre el dueño.
- **Entidad:** `corte_caja`.
- **Dónde vive:** `uq_corte_fecha` y `fn_cerrar_corte`. El rol del que reabre se
  comprueba en el servidor.

### RN-12 — Una conciliación de propinas por mesero y fecha

- **Regla:** no puede haber dos conciliaciones de propina para el mismo mesero y
  la misma fecha.
- **Entidad:** `cierre_propina`.
- **Dónde vive:** `uq_cierre_empleado_fecha` y `fn_cerrar_propinas`.
- **Autor y fecha del cierre:** la migración `015` agrega la versión de
  `fn_cerrar_propinas` con un cuarto argumento, `p_cerrado_por`, para que el
  cierre guarde quién lo hizo. También compara `fecha` en
  `America/Santo_Domingo`, igual que el índice de RN-04 y las rutas. La versión
  anterior de tres argumentos se conserva por compatibilidad, pero la API usa la
  de cuatro y lo comprueba una prueba contra PostgreSQL.

### RN-13 — La existencia no queda negativa

- **Regla:** una salida de inventario no puede dejar la existencia en negativo.
- **Entidad:** `existencia`, `movimiento_inventario`.
- **Dónde vive:** `ck_existencia_no_negativa` y `fn_mover_existencia`, que lanza
  una excepción con el nombre del insumo antes de dejarla en negativo.

### RN-14 — El ajuste guarda la diferencia

- **Regla:** el ajuste por conteo guarda la diferencia calculada, no la
  existencia final. La diferencia puede ser positiva (sobró) o negativa (faltó).
- **Entidad:** `movimiento_inventario`.
- **Dónde vive:** `ck_movimiento_signo` (`Ajuste por conteo` exige
  `cantidad <> 0`). La restricción original exigía `cantidad > 0`, lo que
  contradecía esta regla e impedía registrar un faltante; se corrigió en la
  migración `013`. El servidor calcula la diferencia y guarda el detalle del
  conteo, sin aceptar la existencia final como cantidad.

### RN-15 — Una zona con mesas no se elimina

- **Regla:** una zona con mesas asignadas no se elimina.
- **Entidad:** `zona`, `mesa`.
- **Dónde vive:** `mesa.id_zona` con `ON DELETE RESTRICT`.
- **A verificar en la Fase 1:** confirmar que el `FK` de `mesa.id_zona` no
  permite `SET NULL` ni `CASCADE`.

### RN-16 — Producto, proveedor y empleado no se borran

- **Regla:** un producto con historial de ventas no se elimina, solo se
  desactiva; un proveedor se desactiva, nunca se borra.
- **Entidad:** `producto`, `proveedor`, `empleado`.
- **Dónde vive:** tres disparadores que rechazan el borrado
  (`trg_producto_no_borrar`, `trg_proveedor_no_borrar` y `trg_empleado_no_borrar`,
  agregados los dos últimos en la migración `010`), más las columnas de estado
  (`activo`, `estado`).
- **Ojo:** cada disparador da dos mensajes distintos: uno cuando ya dejó historial
  (ventas, compras, servicio) y otro cuando no, pero en los dos casos rechaza el
  borrado. La salida es siempre desactivar: `UPDATE … SET estado = 'Inactivo'`.
- **Corregido en la Fase 1:** el esquema del profesor solo protegía al producto.
  Borrar un proveedor dejaba sus compras con `id_proveedor` en `NULL` y borrar un
  empleado se llevaba por delante su cuenta de acceso.

### RN-17 — Nombres únicos

- **Regla:** el nombre del producto, del insumo, del proveedor, de la categoría y
  de la estación es único. Para el catálogo, la comparación no distingue
  mayúsculas ni tildes: "Pollo a la brasa" y "POLLO A LA BRASA" son el mismo
  nombre.
- **Dónde vive:** `uq_producto_nombre`, `uq_insumo_nombre`,
  `uq_proveedor_nombre`, `uq_categoria_nombre` y `uq_estacion_nombre`; además, la
  migración `012` agrega `fn_nombre_normalizado(texto)` y los índices
  `uq_producto_nombre_normalizado`, `uq_categoria_nombre_normalizado` y
  `uq_estacion_nombre_normalizado`.
- **Ojo:** las restricciones exactas no se reemplazan; los índices normalizados
  las complementan. La API traduce la violación a `NOMBRE_DUPLICADO`.

### RN-18 — Usuario y cédula únicos

- **Regla:** el usuario y la cédula del empleado son únicos.
- **Dónde vive:** `uq_usuario_nombre`, `uq_empleado_cedula`.

### RN-19 — La tasa de impuesto no es cero

- **Regla:** la tasa de impuesto no puede ser cero ni negativa.
- **Entidad:** `parametro`.
- **Dónde vive:** dominio `porcentaje` (`0 < valor ≤ 100`) más
  `ck_parametro_tasa` (`tasa_impuesto > 0`).
- **Nota:** `parametro` está pensado para un solo registro vigente. **Decisión
  pendiente:** ¿se fuerza "uno solo vigente" con un índice único, como dice el
  comentario de la tabla, o se deja como histórico?

### RN-20 — La mesa no se sobrepasa

- **Regla:** las personas de una mesa no pueden superar su capacidad.
- **Entidad:** `mesa`, `reserva`.
- **Dónde vive:** `ck_mesa_personas` (`personas <= capacidad`) y el trigger
  `trg_capacidad_reserva` con `fn_validar_capacidad_reserva`, que devuelve el
  mensaje "La mesa % tiene capacidad para % personas".

### RN-21 — Una reserva viva por mesa y hora

- **Regla:** no se puede reservar una mesa que ya está ocupada o reservada para
  esa fecha y hora.
- **Entidad:** `reserva`.
- **Dónde vive:** índice único `uq_reserva_por_mesa_hora` sobre
  `(id_mesa, fecha, hora) WHERE estado <> 'Cancelada'`.

### RN-22 — Una promoción termina después de empezar

- **Regla:** una promoción necesita fecha de fin posterior a la de inicio.
- **Entidad:** `promocion`.
- **Dónde vive:** `ck_promocion_vigencia` (`fecha_fin >= fecha_inicio`).
- **Nota:** el CHECK acepta el mismo día. El plan dice "posterior a la de
  inicio". **Decisión pendiente:** ¿se permite que empiece y termine el mismo día?

### RN-23 — Dar de baja es inmediato

- **Regla:** un empleado dado de baja queda inactivo de inmediato y conserva su
  historial.
- **Entidad:** `empleado`.
- **Dónde vive:** columna `estado` (`Activo` / `Inactivo` / `Bloqueado`). El
  historial se conserva porque nada se borra.

### RN-24 — Tres intentos fallidos bloquean

- **Regla:** tres intentos fallidos bloquean la cuenta; solo el administrador la
  habilita.
- **Entidad:** `usuario`.
- **Dónde vive:** columnas `intentos_fallidos` y `estado`. La lógica está en el
  servidor (Fase 2), que además debe llevar rate limiting por IP.

### RN-25 — Las credenciales de la pasarela no se guardan

- **Regla:** las credenciales de la pasarela de pagos nunca se guardan en la base
  de datos.
- **Entidad:** `parametro`.
- **Dónde vive:** van en variables de entorno (`.env`), nunca en una tabla.
- **A verificar en la Fase 1:** la tabla `parametro` tiene una columna
  `cuenta_pagos`. Hay que decidir si se elimina o si solo guarda una cuenta
  pública (no una credencial).
- **Resuelto en la Fase 1 (a falta de que el dueño lo confirme):** la columna se
  queda, porque puede guardar una **cuenta pública de cobro** (el correo de la
  cuenta del negocio, que el cliente ve al pagar), que no es una credencial. Lo
  que nunca va ahí es la clave secreta de la pasarela: eso vive en el `.env`. La
  decisión quedó escrita en la propia base, en el comentario de la columna
  (migración `007`), y hay una prueba que comprueba que no existe ninguna columna
  que parezca una credencial (`token`, `clave`, `secret`, `password`).

### RN-26 — La bitácora es de solo lectura

- **Regla:** los registros de la bitácora no se modifican ni se borran: solo se
  insertan.
- **Entidad:** `bitacora`.
- **Dónde vive:** trigger `trg_bitacora_solo_lectura` con `fn_bloquear_bitacora`
  (excepción con el mensaje "La bitácora es de solo lectura…").

### RN-27 — La línea anulada guarda el motivo

- **Regla:** las líneas anuladas guardan siempre el motivo.
- **Entidad:** `linea_pedido`, `linea_comanda`.
- **Dónde vive:** `ck_linea_anulacion` y `ck_linea_comanda_anulacion`
  (`estado <> 'Anulada' OR motivo_anulacion IS NOT NULL`).

### RN-28 - Pago con tarjeta o PayPal exige referencia

### RN-29 - Pedir la cuenta y cerrar el servicio

- **Regla:** pedir la cuenta no genera la cuenta ni la cobra. El mesero deja un
  aviso (`mesa.cuenta_pedida_en`) para que el cajero la vea en su cola. Al cobrar
  la cuenta, la mesa pasa automáticamente a limpieza y se borran los datos del
  servicio.
- **Entidad:** `mesa` y `cuenta`.
- **Dónde vive:** `mesa.cuenta_pedida_en`, `fn_pedir_cuenta`, `fn_quitar_cuenta_pedida`,
  `fn_cerrar_servicio_mesa` y el disparador `trg_cerrar_servicio_al_pagar` sobre
  `cuenta`. Pedir la cuenta usa `CAPTURAR_PEDIDO`.
- **Prueba de la Fase 1:** una mesa que pidió la cuenta aparece en `pedidas` de
  `GET /api/cuentas`; al cobrarla, `mesa.estado = 'limpieza'`.

- **Regla:** el pago con tarjeta o PayPal exige referencia.
- **Entidad:** `pago`, `propina`, `comprobante`.
- **Dónde vive:** `ck_pago_referencia`
  (`forma_pago NOT IN ('Tarjeta', 'PayPal') OR referencia IS NOT NULL`),
  `ck_propina_referencia` (solo para `Tarjeta`) y `ck_comprobante_origen`.
- **Inconsistencia detectada:** la regla dice "tarjeta o PayPal", pero
  `ck_propina_referencia` solo exige referencia para `Tarjeta`. **Decisión
  pendiente:** ¿la propina por PayPal también exige referencia?
- **En la Fase 5:** la pantalla y la API de Propinas solo ofrecen **Efectivo** y
  **Tarjeta**; PayPal no se ofrece mientras la decisión 9 siga pendiente. Con
  tarjeta, la referencia es obligatoria en Zod, en la base y con un mensaje claro
  en la pantalla.

---

## 2.5 Verificaciones hechas en la Fase 1

Al convertir el script del prototipo en migraciones se re-verificó cada objeto. El
resultado, para que quede por escrito:

| Qué se verificó | Resultado |
|---|---|
| Número real de tablas | **41** tablas de negocio (no 42 como decía un comentario nuestro). Más la tabla `migracion`, que es del control de versiones. |
| Relación `mesa → zona` (RN-15) | Confirmado: la llave foránea es `ON DELETE RESTRICT`, no `CASCADE` ni `SET NULL`. Hay prueba. |
| Tasa de impuesto (RN-19) | Enforzada dos veces: el dominio `porcentaje` la limita a 0–100 y `ck_parametro_tasa` exige que sea mayor que cero. Hay prueba de los dos extremos. |
| Operaciones del sistema | El script del profesor titula su lista **"Las 28 operaciones"**, pero **solo trae 27**. La 28 se aprobó el 19 de octubre de 2026 como `REPORTAR_AGOTADO` (decisión 13). |
| `to_jsonb(NEW)` en `fn_auditar` | Evaluado: no hay cambio. El disparador nunca guarda el JSON completo, solo saca de ahí el identificador de la fila. Queda explicado en la migración `007`. |
| `parametro.cuenta_pagos` (RN-25) | Resuelto: es una cuenta pública, no una credencial. Ver RN-25. |
| **Defecto encontrado:** `cierre_propina.diferencia` y `corte_caja.diferencia` | **Corregido en la migración `009`.** Estaban declaradas con el dominio `dinero`, que prohíbe negativos, así que el sistema **no podía registrar un faltante de caja**: solo cuadraba cuando sobraba dinero. Lo encontró una prueba automática, no una revisión a ojo. |
| **Hueco encontrado:** RN-16 solo protegía al producto (no al proveedor ni al empleado) | **Corregido en la migración `010`.** Borrar un proveedor dejaba sus compras sin saber a quién se le compraron, y borrar un empleado se llevaba su cuenta de acceso. Ver la decisión 12. |

---

## 3. Reglas que no son constraints

Estas no se pueden expresar como `CHECK` y por eso viven en funciones de la base
o en el servidor:

| Regla | Dónde se cumple |
|---|---|
| RN-03, RN-04 | `fn_abrir_pedido` fija el mesero de la orden |
| RN-05 | `fn_generar_cuenta` es idempotente |
| RN-06 | `fn_cobrar_cuenta` |
| RN-08, RN-10 | `fn_emitir_comprobante`, `fn_anular_comprobante` |
| RN-11 | `fn_cerrar_corte` |
| RN-12 | `fn_cerrar_propinas` |
| RN-13, RN-14 | `fn_mover_existencia` |
| RN-24 | Servidor (login) + rate limiting |
| RN-07, RN-11 | Servidor (rol del autorizante) |

---

## 4. Formato único de respuesta de la API

El plan (sección 7) exige "un formato de respuesta único para toda la API". El
prototipo tenía dos formas distintas (`{ ok: true }` en unas rutas y el objeto
pelado en otras). Esta es la forma definitiva, **ya en uso desde la Fase 2**:

**Éxito**

```json
{ "ok": true, "datos": { } }
```

**Error**

```json
{ "ok": false, "error": { "codigo": "CODIGO_LEGIBLE_POR_MAQUINA", "mensaje": "Texto para la persona" } }
```

Códigos ya en uso:

| Código | HTTP | Cuándo |
|---|---|---|
| `NO_ENCONTRADO` | 404 | La ruta o el dato no existe |
| `JSON_INVALIDO` | 400 | El cuerpo no es un JSON válido |
| `CUERPO_DEMASIADO_GRANDE` | 413 | El cuerpo pasa de 100 kb |
| `DATOS_INVALIDOS` | 400 | Zod rechazó los datos (Fase 2) |
| `SIN_SESION` | 401 | No hay token, venció, o la cuenta ya no está activa (Fase 2) |
| `SIN_PERMISO` | 403 | El rol no tiene el permiso (Fase 2) |
| `CREDENCIALES_INVALIDAS` | 401 | Usuario o clave incorrectos (Fase 2) |
| `CUENTA_BLOQUEADA` | 401 | Tres intentos fallidos (RN-24, Fase 2) |
| `CUENTA_INACTIVA` | 401 | La cuenta está dada de baja (RN-23, Fase 2) |
| `INTEGRACION_NO_CONFIGURADA` | 503 | Falta la clave o la URL de una API externa (Fase 8) |
| `INTEGRACION_FALLIDA` | 502 | La API externa rechazó la operación o no se pudo contactar (Fase 8) |
| `RESPUESTA_INVALIDA` | 502 | La API externa respondió algo que no es JSON (Fase 8) |
| `DEMASIADAS_PETICIONES` | 429 | Pasó el límite de peticiones (Fase 2) |
| `ERROR_INTERNO` | 500 | Cualquier error no previsto |

**Códigos previstos para las fases siguientes:** `YA_EXISTE` (409),
`CONFLICTO_DE_ESTADO` (409), `REGLA_DE_NEGOCIO` (409).

Reglas del formato:

- El `mensaje` es para mostrar en pantalla: claro, en español, sin nombres de
  tablas ni de columnas.
- El `codigo` es para el programa: estable y en mayúsculas.
- Un error 500 nunca revela el detalle interno; el detalle va al registro del
  servidor.

---

## 4.5 Matriz de permisos (aprobada por el dueño en la Fase 2)

El plan (sección 8) trae una matriz de **5 roles**, pero la base tiene **8** (son
los del diseño del profesor, ver la decisión 14). Esta es la matriz para los 8,
deducida de dos cosas: la matriz del plan y la descripción que cada rol tiene en la
propia base (migración `008`).

**Esta tabla es la versión oficial: el dueño la aprobó el 18 de octubre de 2026.**
Las casillas que eran interpretación mía (y que el dueño revisó) quedan marcadas con
**★**, para que se sepa de dónde salió cada una. Vive en la base desde la migración
`011`, y hay una prueba (`matriz-de-permisos.integracion.test.js`) que **lee esta
tabla y la compara, casilla por casilla, contra lo que hay en `rol_permiso`**: si las
dos se separan, la prueba falla. Si hay que cambiar algo, se cambia aquí **y** en una
migración nueva.

Leyenda: **S** = sí, **—** = no, **★** = era interpretación mía (el dueño la aprobó).

| Permiso (los 28 de la base) | Dueño | Gerente | Capitán | Mesero | Anfitrión | Cocina | Cajero | Almacén |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `VER_MESAS` | S | S | S | S | S | — | S | — |
| `ASIGNAR_MESA` | S | S | S | S | S | — | — | — |
| `GESTIONAR_RESERVA` | S | S | ★— | — | S | — | — | — |
| `CAPTURAR_PEDIDO` | S | S | S | S | — | — | — | — |
| `VER_DISPONIBILIDAD` | S | S | S | S | S | ★S | S | — |
| `VER_ASISTENTE` | S | S | ★— | — | — | — | — | — |
| `CONFIRMAR_PREPARACION` | S | S | ★— | — | — | S | — | — |
| `REPORTAR_AGOTADO` | S | S | — | — | — | S | — | — |
| `MARCAR_ENTREGA` | S | S | S | S | — | ★— | — | — |
| `GENERAR_CUENTA` | S | S | ★S | ★— | — | — | S | — |
| `DIVIDIR_CUENTA` | S | S | ★S | — | — | — | S | — |
| `APLICAR_DESCUENTO` | S | S | ★S | — | — | — | ★S | — |
| `APLICAR_CORTESIA` | S | — | ★— | — | — | — | ★— | — |
| `REGISTRAR_PAGO` | S | S | ★— | — | — | — | S | — |
| `EMITIR_COMPROBANTE` | S | S | ★— | — | — | — | S | — |
| `REGISTRAR_PROPINA` | S | S | S | S | — | — | ★— | — |
| `CERRAR_PROPINAS` | S | S | S | — | — | — | — | — |
| `REALIZAR_CORTE` | S | S | ★— | — | — | — | S | — |
| `CONSULTAR_REPORTES` | S | S | ★S | — | — | — | ★S | — |
| `ADMINISTRAR_PRODUCTOS` | S | S | — | — | — | — | — | — |
| `ADMINISTRAR_MESAS` | S | S | — | — | ★— | — | — | — |
| `ADMINISTRAR_PROMOCIONES` | S | S | — | — | — | — | — | — |
| `ADMINISTRAR_PERSONAL` | S | S | — | — | — | — | — | — |
| `ADMINISTRAR_PARAMETROS` | S | S | — | — | — | — | — | — |
| `CONSULTAR_BITACORA` | S | S | — | — | — | — | — | — |
| `VER_EXISTENCIAS` | S | S | ★— | — | — | ★S | — | S |
| `MOVER_INVENTARIO` | S | S | — | — | — | ★— | — | S |
| `ADMINISTRAR_INSUMOS` | S | S | — | — | — | — | — | ★S |

Notas de lo que se decidió en cada caso señalado:

- **El dueño puede todo.** Es el nivel más alto (`nivel 5`). No se le quitó nada.
- **`APLICAR_CORTESIA` y `ADMINISTRAR_PARAMETROS`:** son las dos acciones más
  delicadas (regalar consumo y tocar la tasa de impuesto y la numeración fiscal).
  La descripción del rol *Dueño* dice que él "aprueba cortesías", pero la matriz
  del plan pone al Gerente en "Descuentos, cortesías y anulaciones". Se dejaron los
  dos, siguiendo el plan. Si más adelante la cortesía tiene que ser solo del dueño,
  se cambia aquí y en una migración nueva.
- **`APLICAR_DESCUENTO` en Caja:** el plan dice "Con tope". El tope todavía no está
  decidido (decisión 2). Por ahora Caja tiene el permiso y el tope se aplicará en el
  servidor el día que se decida.
- **`REGISTRAR_PROPINA` en Cajero:** el plan dice que el mesero registra la propina.
  Por eso el cajero no lo tiene. Si el cajero también pudiera (por ejemplo, cuando el
  cliente deja la propina al pagar), hay que darle el permiso aquí y en una migración
  nueva.
- **`MARCAR_ENTREGA` en Cocina:** quedó en **no** porque el que entrega en la mesa
  es el mesero, no la cocina. La cocina solo avisa que el plato está listo
  (`CONFIRMAR_PREPARACION`).
- **`MOVER_INVENTARIO` en Cocina:** el plan dice "Limitado", pero entre los 27
  permisos originales no había ninguno que sirviera para eso: la cocina solo podía
  *ver* las existencias. Era la pista más fuerte de cuál era la operación 28 que
  faltaba (ver la decisión 13).
- **`REPORTAR_AGOTADO` (la operación 28):** el dueño la aprobó el 19 de octubre de
  2026 y se la dio al dueño, al gerente y a la cocina. Sirve para marcar un
  producto agotado **y para reponerlo** cuando vuelve a haber; no se inventó un
  segundo permiso. La carga la migración `014`.
- **El almacén** administra los insumos y sus proveedores (★) además de registrar
  los movimientos: sin eso no podría dar de alta un insumo nuevo.

**Cómo quedó cargada.** La migración `011_matriz_de_permisos.sql` llenó las **216
casillas** (8 × 27) que había entonces: las 90 que decían "sí" y también las 126
que decían "no". La migración `014_permiso_reportar_agotado.sql` agregó la
operación 28 y sus 8 casillas. Hoy son **224 casillas** (8 × 28): **92 marcadas**
y 131 en "no". Se llenan todas a propósito, para que en la base quede escrito que
cada "no" se pensó, y no parezca un olvido.

---

## 5. Decisiones pendientes de confirmar con el dueño

| # | Decisión | Dónde se necesita | Estado |
|---|---|---|---|
| 1 | **Matriz de permisos** por rol (sección 8 del plan) | Fase 2 | **Resuelta.** El dueño aprobó la propuesta de la sección 4.5 el 18 de octubre de 2026 y la cargó la migración `011`. Hay una prueba que compara la base contra la tabla del documento, casilla por casilla. |
| 2 | **Tope máximo** de descuento que puede aplicar Caja | Fase 6 | Pendiente |
| 3 | Cálculo de horas del catálogo: el `/ 10` del prototipo parece un error | Fase 7 | **Resuelta el 20 de octubre de 2026.** El dueño decidió que las horas se calculan con **minutos / 60**. El reporte de productos agotados y la pantalla de Cocina ya usan esa fórmula, y el `/ 10` del prototipo quedó atrás. |
| 4 | ¿La fórmula de totales (RN-05) lleva ya el impuesto o el impuesto se suma en el comprobante (RN-10)? | Fase 1 | **Comportamiento aclarado.** El total de la cuenta **ya incluye** el impuesto; el comprobante lo saca hacia atrás (`base = total / (1 + tasa/100)`). Hay prueba. Falta que el dueño confirme que es lo que quiere. |
| 5 | Cuenta con líneas sin enviar: ¿la función de la base lanza excepción o la ruta responde 409? | Fase 1 / Fase 6 | **Parcialmente resuelto en la Fase 6, módulo 1.** La ruta responde `409 CONFLICTO_DE_ESTADO` si hay líneas sin enviar o sin consumo enviado, y no crea la cuenta. La función `fn_generar_cuenta` de la base sigue generando una cuenta de RD$ 0 si se la llama directamente. Queda pendiente decidir si se corrige ahí o se deja así. |
| 6 | Empleado "dado de baja": ¿pasa a `Inactivo` y además se borra su `usuario`? | Fase 4 | **Resuelta.** El dueño decidió el 18 de octubre de 2026 que el empleado y su cuenta pasan a `Inactivo` en la misma transacción. No se borra nada (RN-16) y la cuenta se conserva para el historial. Un botón **Reactivar** vuelve a dejar los dos en `Activo`. |
| 7 | Vencimiento de la sesión (el prototipo usaba 12 horas en memoria) | Fase 2 | **Resuelta.** 12 horas, y el valor vive en `servidor/.env` (`SESION_HORAS=12`) para poder cambiarlo sin tocar código. |
| 8 | ¿Se permite el mismo día como inicio y fin de una promoción? | Fase 4 | Pendiente. Hoy la base **sí lo permite** (el `CHECK` es `fecha_fin >= fecha_inicio`), y hay una prueba que lo deja escrito. |
| 9 | Propina por PayPal: ¿exige referencia igual que la tarjeta? | Fase 5 | Pendiente. Para no inventar una regla, la pantalla y la API de Propinas **solo ofrecen Efectivo y Tarjeta**; PayPal no se ofrece. La base sigue sin exigir referencia para PayPal, y hay una prueba que lo deja escrito. |
| 10 | ¿Se mantiene PayPal? (Fase 8 lo condiciona a "si se mantiene") | Fase 8 | **Resuelta el 20 de octubre de 2026.** El dueño decidió mantener PayPal. La Fase 8 lo integra de verdad contra la API de PayPal (sandbox primero) y el cobro solo se registra en la base cuando PayPal confirma. No hay simulador: sin credenciales el sistema avisa que falta la configuración. |
| 11 | RN-04: ¿la propina la registra solo el mesero de la orden, o cualquiera puede registrarla en cualquier mesa? | Fase 5 | Pendiente. El servidor implementó la **regla escrita**: solo el empleado que abrió el pedido de esa mesa hoy puede registrarla; otro recibe `403 SIN_PERMISO`, y hay prueba. La base sigue permitiendo que dos meseros distintos registren en la misma mesa el mismo día (el índice único incluye al empleado). Si el dueño decide que cualquiera autorizado puede hacerlo, hay que cambiar la comprobación del servidor y sus pruebas, no solo la pantalla. |
| 12 | **RN-16 a medias:** ¿se agregan disparadores para que no se pueda borrar un **proveedor** ni un **empleado**? Hoy solo el producto tiene esa protección | Fase 1 / Fase 4 | **Resuelta en la Fase 1.** El dueño aprobó cerrar el hueco en la base. La migración `010` agrega `trg_proveedor_no_borrar` y `trg_empleado_no_borrar`, con el mismo criterio que el del producto: dos mensajes distintos (con historial o sin él), pero el borrado se rechaza siempre. La salida es desactivar (`estado = 'Inactivo'`). Hay pruebas de los dos casos y de la salida. |
| 13 | **Falta una operación en la lista de permisos** del prototipo: el título dice 28 y la lista trae 27 | Fase 2 / Fase 5 | **Resuelta el 19 de octubre de 2026.** El dueño aprobó la operación 28 como `REPORTAR_AGOTADO` (marcar agotado y reponer), para dueño, gerente y cocina. La carga la migración `014`. |
| 14 | **8 roles** (diseño del profesor) **contra 5** (matriz del plan, sección 8) | Fase 2 | Se conservaron los **8** del diseño, que incluyen a los 5 de la matriz. La equivalencia está escrita en la migración `008`. Falta que el dueño confirme. |
| 15 | **Comprobante anulado:** con la regla de "un comprobante por cuenta", una cuenta cuyo comprobante se anuló **no puede recibir otro** | Fase 6 | **Detectado en la Fase 1.** Hay que decidir si se permite reemitir después de anular, y cómo queda la contabilidad. |
| 16 | ¿Los **roles y permisos** van en una migración (como se hizo) o en la semilla de desarrollo? | Fase 1 | Se pusieron en la migración `008`, porque son parte del modelo del sistema: sin ellos no se puede autorizar nada. Si el dueño prefiere otra cosa, se mueven. |
| 17 | **BIGINT como número en JavaScript:** los identificadores y conteos llegan al servidor como número, no como texto | Fase 2 | Decisión del equipo, documentada en `servidor/src/db/conexion.js`. Es seguro para el tamaño de este sistema; se anota por transparencia. |
| 18 | **Límite de peticiones** (rate limiting) | Fase 2 | **Resuelta.** 300 peticiones por IP cada 15 minutos para la API en general, y 10 intentos de login por IP cada 15 minutos (más el bloqueo de la cuenta a los 3 fallos de la RN-24). Los dos valores viven en `servidor/.env`. |
| 19 | **Cerrar sesión no invalida el token en el servidor.** El token se comprueba solo (lleva su firma) y el servidor no guarda una lista de sesiones, así que al cerrar sesión el cliente tira el token y ya | Fase 2 | **Detectado en la Fase 2.** Funciona bien mientras el token viva poco y no se filtre. Si el dueño necesita invalidarlo de verdad (se perdió un equipo, alguien se va enojado), hay que agregar una tabla de sesiones o un contador por usuario. Es una tabla nueva, y por eso no se inventó: hay que decidirla |
| 20 | **Largo mínimo de la clave** al crear o restablecer una cuenta | Fase 4 | **Resuelta.** El dueño decidió el 18 de octubre de 2026 que son **8 caracteres**. Se aplica al crear y al restablecer; el login no lo exige, para no delatar claves viejas que sean más cortas. |
| 21 | **El número del comprobante:** ¿el de la plataforma de la DGII o el local? | Fase 8 | **Resuelta el 20 de octubre de 2026.** El número lo asigna la plataforma (se le manda el comprobante sin `eNCF`) y ese es el que se guarda y se ve. La secuencia local queda solo para el camino sin plataforma. |
| 22 | **¿De dónde sale la tasa de cambio** para cobrar en PayPal? | Fase 8 | **Resuelta el 20 de octubre de 2026.** De la base: `parametro.tasa_cambio_usd` (cuántos pesos vale un dólar), escrita por el dueño. No se consulta ninguna API de cambio, para que el cobro no dependa de un servicio externo. |
| 23 | **Qué código de forma de pago** va en la factura electrónica | Fase 8 | **Resuelta el 20 de octubre de 2026.** Efectivo 1, Cheque 2, Tarjeta 3, Tarjeta de débito 4, PayPal 3 y Crédito 2. La tabla vive en un solo archivo (`servicios/comprobante-fiscal.js`) para poder corregirla de una vez. |
| 24 | **Cobro por comensal:** una cuenta dividida se cobra por partes | Fase 8 | **Resuelta el 20 de octubre de 2026.** El total se reparte **proporcional a lo que pidió cada comensal** (el último que se queda con los centavos de redondeo) y **cada comensal que paga puede pedir su propio comprobante fiscal** (`uq_comprobante_por_pago`). La RN-06 se conserva partida: **un** cobro completo por cuenta (`uq_pago_cuenta_completo`) y **un** cobro por comensal (`uq_pago_comensal`). Lo puso el dueño, no el equipo. |
| 25 | **El servicio (propina legal del 10 %) de los restaurantes** | Fase 8 | **Queda apagado (0 %) y lo activa el dueño** (20 de octubre de 2026). En la RD el 10 % de servicio de los restaurantes es legal y la plataforma de la DGII lo declara aparte, como `MontoImpuestoAdicional` (así lo trae su ejemplo de restaurante). El sistema ya sabe hacerlo: `parametro.propina_legal_porcentaje`, `fn_servicio_de_la_cuenta` (el 10 % **del gravado**) y el cobro lo pide junto con la cuenta. **Ojo:** activarlo suma un 10 % a cada cuenta y el cliente paga esa parte. Es distinto de la propina del mesero, que no entra en el comprobante. |

---

## 6. Reglas de oro del trabajo (recordatorio)

1. Nada se simula.
2. Cero datos de ejemplo en el código.
3. Una fase a la vez.
4. Cada funcionalidad nace con su prueba.
5. La base de datos es la fuente única de verdad.
6. Seguridad desde el primer endpoint.
7. Todo error se muestra al usuario.
8. Si algo no está claro, se pregunta antes de inventar.
9. Cambios pequeños y verificables, un commit por tarea.
10. Se informa con honestidad: qué se probó y qué quedó pendiente.

Ver `docs/plan-por-fases.md` para el detalle completo.
