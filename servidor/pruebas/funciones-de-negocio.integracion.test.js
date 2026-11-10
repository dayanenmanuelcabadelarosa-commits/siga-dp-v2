/*
  Funciones de negocio, probadas contra PostgreSQL de verdad.
  ----------------------------------------------------------

  El primer archivo (reglas-de-negocio) comprueba que la base RECHACE lo que las
  reglas prohíben. Este comprueba lo contrario: que cuando se le pide hacer algo
  válido, lo haga bien.

  Aquí viven las reglas que no se pueden escribir como CHECK: las que necesitan
  mirar varias tablas y decidir (RN-03, RN-04, RN-05, RN-06, RN-08, RN-10, RN-11,
  RN-12, RN-13, RN-14).
*/

import { afterAll, describe, expect, it } from "vitest";

import { cerrarPool, conBaseDePrueba } from "./ayudas/base-de-prueba.js";

afterAll(async () => {
  await cerrarPool();
});

// =====================================================================================
describe("fn_abrir_pedido", () => {
  it("solo abre pedido en una mesa ocupada", async () => {
    await conBaseDePrueba(async (ay) => {
      const idZona = await ay.zona();
      const idMesa = await ay.mesa({ idZona });
      const idMesero = await ay.empleado({ rol: "mesero" });

      const error = await ay.viola("SELECT fn_abrir_pedido($1::INTEGER, $2::INTEGER, $3::SMALLINT)", [
        idMesa,
        idMesero,
        1,
      ]);

      expect(error.message).toMatch(/mesa ocupada/i);
    });
  });

  it("anota un comensal por cada persona que se sentó", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ comensales: 4 });

      const comensales = await ay.sql(
        "SELECT comensal, orden_llegada FROM mesa_pedido WHERE id_pedido = $1 ORDER BY comensal",
        [s.idPedido],
      );

      expect(comensales).toHaveLength(4);
      expect(comensales.map((fila) => fila.comensal)).toEqual([1, 2, 3, 4]);
      expect(comensales.map((fila) => fila.orden_llegada)).toEqual([1, 2, 3, 4]);
    });
  });
});

// =====================================================================================
describe("fn_generar_cuenta (RN-05)", () => {
  it("llamarla dos veces devuelve la misma cuenta", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      const primera = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);
      const segunda = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      expect(segunda).toBe(primera);

      const cuantas = await ay.numero("SELECT count(*) FROM cuenta WHERE id_mesa = $1", [s.idMesa]);
      expect(cuantas).toBe(1);
    });
  });

  it("copia las líneas enviadas y cierra el pedido", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 3 });

      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      const lineas = await ay.sql("SELECT importe FROM linea_cuenta WHERE id_cuenta = $1", [idCuenta]);
      const pedido = await ay.uno("SELECT estado, cerrado_en FROM pedido WHERE id_pedido = $1", [
        s.idPedido,
      ]);
      const mesa = await ay.uno("SELECT estado_pedido FROM mesa WHERE id_mesa = $1", [s.idMesa]);

      expect(lineas).toHaveLength(3);
      expect(pedido.estado).toBe("Cerrado");
      expect(pedido.cerrado_en).not.toBeNull();
      expect(mesa.estado_pedido).toBe("Cuenta pedida");
    });
  });

  it("no copia las líneas que la cocina anuló", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 2 });

      await ay.sql(
        `UPDATE linea_comanda SET estado = 'Anulada', motivo_anulacion = 'Se acabó el producto'
          WHERE id_linea_pedido = $1`,
        [s.lineas[0].idLineaPedido],
      );

      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);
      const lineas = await ay.sql("SELECT id_linea_pedido FROM linea_cuenta WHERE id_cuenta = $1", [
        idCuenta,
      ]);

      expect(lineas).toHaveLength(1);
      expect(lineas[0].id_linea_pedido).toBe(s.lineas[1].idLineaPedido);
    });
  });

  it("no factura una mesa que no tiene pedido abierto", async () => {
    await conBaseDePrueba(async (ay) => {
      const idMesa = await ay.mesa({ capacidad: 4 });

      const error = await ay.viola("SELECT fn_generar_cuenta($1::INTEGER)", [idMesa]);

      expect(error.message).toMatch(/no tiene pedido abierto/i);
    });
  });

  it("HOY factura en cero si el pedido solo tiene líneas sin enviar", async () => {
    // Comportamiento actual del prototipo, anotado como decisión pendiente
    // número 5 (docs/reglas-de-negocio.md, sección 5): si el pedido tiene líneas
    // todavía en 'Borrador', fn_generar_cuenta genera una cuenta vacía de RD$ 0
    // en vez de avisar. El prototipo lo tapaba en la ruta de la API con un 409.
    // Esta prueba deja escrito cómo se comporta la base, para decidir si se
    // corrige aquí o se sigue corrigiendo en el servidor.
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      await ay.sql("UPDATE linea_pedido SET estado = 'Borrador' WHERE id_pedido = $1", [s.idPedido]);

      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);
      const total = await ay.numero("SELECT fn_total_cuenta($1::INTEGER)", [idCuenta]);

      expect(idCuenta).toBeGreaterThan(0);
      expect(total).toBe(0);
    });
  });
});

// =====================================================================================
describe("fn_total_cuenta", () => {
  it("suma las líneas y resta los descuentos", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 2, precios: [300, 200] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      const sinDescuento = await ay.numero("SELECT fn_total_cuenta($1::INTEGER)", [idCuenta]);
      expect(sinDescuento).toBe(500);

      await ay.sql(
        `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
         VALUES ($1, 'Descuento', 125, 'Descuento', $2)`,
        [idCuenta, s.idCapitan],
      );

      const conDescuento = await ay.numero("SELECT fn_total_cuenta($1::INTEGER)", [idCuenta]);
      expect(conDescuento).toBe(375);
    });
  });

  it("una cuenta sin líneas da cero, no nulo", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);
      await ay.sql("DELETE FROM linea_cuenta WHERE id_cuenta = $1", [idCuenta]);

      const total = await ay.numero("SELECT fn_total_cuenta($1::INTEGER)", [idCuenta]);
      expect(total).toBe(0);
    });
  });
});

// =====================================================================================
describe("fn_cobrar_cuenta (RN-06)", () => {
  it("cobra en efectivo, calcula el cambio y deja la cuenta pagada", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [400] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      const pago = await ay.uno(
        `SELECT pago_id, cambio FROM fn_cobrar_cuenta(
           $1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 500, s.idCajero],
      );

      const cuenta = await ay.uno("SELECT estado, cerrada_en FROM cuenta WHERE id_cuenta = $1", [
        idCuenta,
      ]);

      expect(pago.cambio).toBe(100);
      expect(cuenta.estado).toBe("Pagada");
      expect(cuenta.cerrada_en).not.toBeNull();
    });
  });

  it("no cobra si el efectivo recibido no alcanza", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [400] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      const error = await ay.viola(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 399, s.idCajero],
      );

      // Desde la migración 018 el mensaje dice "lo que hay que cobrar", porque
      // el total a cobrar incluye la propina.
      expect(error.message).toMatch(/menor que lo que hay que cobrar/i);
    });
  });

  it("el cambio descuenta la propina (migración 018)", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [400] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [
        s.idMesa,
      ]);

      // El cliente da 450: 400 de la cuenta más 50 de propina. El cambio es 0.
      const cobro = await ay.uno(
        `SELECT * FROM fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, 450, $2, 50, NULL)`,
        [idCuenta, s.idCajero],
      );

      expect(cobro.cambio).toBeNull();

      const propina = await ay.numero(
        "SELECT COUNT(*) FROM propina WHERE id_cuenta = $1",
        [idCuenta],
      );
      expect(propina).toBe(1);

      const pago = await ay.uno(
        "SELECT monto_recibido::FLOAT8 AS recibido FROM pago WHERE id_cuenta = $1",
        [idCuenta],
      );
      expect(pago.recibido).toBe(450);
    });
  });

  it("no cobra dos veces la misma cuenta", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [400] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 400, s.idCajero],
      );

      const error = await ay.viola(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 400, s.idCajero],
      );

      expect(error.message).toMatch(/no se puede cobrar/i);
    });
  });

  it("la propina queda a nombre del mesero de la orden, no de quien cobra (RN-04)", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [400] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER, $4::dinero)`,
        [idCuenta, 500, s.idCajero, 60],
      );

      const propina = await ay.uno("SELECT id_empleado, monto FROM propina WHERE id_cuenta = $1", [
        idCuenta,
      ]);

      expect(propina.id_empleado).toBe(s.idMesero);
      expect(propina.id_empleado).not.toBe(s.idCajero);
      expect(propina.monto).toBe(60);
    });
  });

  it("no registra propina si el cliente no dejó nada", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [400] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 400, s.idCajero],
      );

      const cuantas = await ay.numero("SELECT count(*) FROM propina WHERE id_cuenta = $1", [idCuenta]);
      expect(cuantas).toBe(0);
    });
  });

  it("el cobro con tarjeta genera solo su referencia de propina (RN-28)", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [400] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_cobrar_cuenta(
           $1::INTEGER, 'Tarjeta'::forma_pago, $2::dinero, $3::INTEGER, $4::dinero, $5)`,
        [idCuenta, 400, s.idCajero, 50, "AUTORIZACION-999"],
      );

      const propina = await ay.uno("SELECT referencia FROM propina WHERE id_cuenta = $1", [idCuenta]);
      expect(propina.referencia).toMatch(/^COBRO-/);
    });
  });

  it("el cobro con tarjeta sin referencia lo rechaza la base", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [400] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      const error = await ay.viola(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Tarjeta'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 400, s.idCajero],
      );

      expect(error.code).toBe("23514");
    });
  });
});

// =====================================================================================
describe("fn_emitir_comprobante (RN-08 y RN-10)", () => {
  it("toma el número de la secuencia y lo deja con el formato fiscal", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [118] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      const ncf = await ay.uno(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER) AS ncf`,
        [idCuenta, "Consumidor final", s.idCajero],
      );

      expect(ncf.ncf).toMatch(/^B01\d{9}$/);

      const ultimo = await ay.numero(
        "SELECT ultimo_numero FROM secuencia_ncf WHERE tipo = 'B01'",
      );
      const siguiente = await ay.numero(
        "SELECT siguiente_numero FROM secuencia_ncf WHERE tipo = 'B01'",
      );
      expect(siguiente).toBe(ultimo + 1);
    });
  });

  it("calcula base e impuesto con la tasa vigente (18 %)", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [118] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER)`,
        [idCuenta, "Consumidor final", s.idCajero],
      );

      const comprobante = await ay.uno(
        "SELECT base, impuesto, total FROM comprobante WHERE id_cuenta = $1",
        [idCuenta],
      );

      // 118 con 18 % incluido: base 100, impuesto 18.
      expect(comprobante.base).toBe(100);
      expect(comprobante.impuesto).toBe(18);
      expect(comprobante.base + comprobante.impuesto).toBe(comprobante.total);
    });
  });

  it("copia las líneas de la cuenta al comprobante", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 3 });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER)`,
        [idCuenta, "Consumidor final", s.idCajero],
      );

      const copiadas = await ay.numero(
        `SELECT count(*) FROM linea_comprobante lc
           JOIN comprobante c ON c.id_comprobante = lc.id_comprobante
          WHERE c.id_cuenta = $1`,
        [idCuenta],
      );

      expect(copiadas).toBe(3);
    });
  });

  it("rechaza una cuenta que ya tiene comprobante (corrección de la auditoría)", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER)`,
        [idCuenta, "Consumidor final", s.idCajero],
      );

      const error = await ay.viola(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER)`,
        [idCuenta, "Consumidor final", s.idCajero],
      );

      // La función avisa con un mensaje claro ANTES de llegar al índice único.
      // Ese aviso es un RAISE EXCEPTION normal, así que su código es P0001
      // (raise_exception). El índice uq_comprobante_por_cuenta sigue ahí detrás
      // como red de seguridad, para que ni por descuido se puedan emitir dos.
      expect(error.code).toBe("P0001");
      expect(error.message).toMatch(/ya tiene el comprobante/i);
    });
  });

  it("no emite comprobante de una cuenta que no existe", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      const error = await ay.viola(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER)`,
        [99999999, "Consumidor final", s.idCajero],
      );

      expect(error.message).toMatch(/no existe/i);
    });
  });

  it("el comprobante de una cuenta no estorba al de una venta de canal", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      const idVenta = await ay.numero(
        `INSERT INTO venta_canal (canal, nombre_cliente, total, id_registrado_por)
         VALUES ('Delivery', 'Cliente de canal', 118, $1) RETURNING id_venta`,
        [s.idCajero],
      );

      const ncf = await ay.uno(
        `INSERT INTO comprobante (tipo, id_venta_canal, cliente, base, impuesto, total, forma_pago, id_emitido_por)
         VALUES ('B02', $1, 'Cliente de canal', 100, 18, 118, 'Efectivo', $2)
         RETURNING numero_ncf`,
        [idVenta, s.idCajero],
      );

      expect(ncf.numero_ncf).toMatch(/^B02\d{9}$/);
    });
  });
});

// =====================================================================================
describe("fn_anular_comprobante (RN-08)", () => {
  it("deja el comprobante anulado con quién y cuándo", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      const emitido = await ay.uno(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER) AS ncf`,
        [idCuenta, "Consumidor final", s.idCajero],
      );

      await ay.sql("SELECT fn_anular_comprobante($1, $2::INTEGER)", [emitido.ncf, s.idCajero]);

      const comprobante = await ay.uno(
        "SELECT estado, anulado_en, id_anulado_por FROM comprobante WHERE numero_ncf = $1",
        [emitido.ncf],
      );

      expect(comprobante.estado).toBe("Anulado");
      expect(comprobante.anulado_en).not.toBeNull();
      expect(comprobante.id_anulado_por).toBe(s.idCajero);
    });
  });

  it("no anula dos veces el mismo comprobante", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      const emitido = await ay.uno(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER) AS ncf`,
        [idCuenta, "Consumidor final", s.idCajero],
      );

      await ay.sql("SELECT fn_anular_comprobante($1, $2::INTEGER)", [emitido.ncf, s.idCajero]);

      const error = await ay.viola("SELECT fn_anular_comprobante($1, $2::INTEGER)", [
        emitido.ncf,
        s.idCajero,
      ]);

      expect(error.message).toMatch(/ya estaba anulado/i);
    });
  });

  it("el número anulado no se reutiliza ni se devuelve a la secuencia", async () => {
    await conBaseDePrueba(async (ay) => {
      const primero = await ay.servicio({ cuantasLineas: 1 });
      const segundo = await ay.servicio({ cuantasLineas: 1 });

      const cuentaUno = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [primero.idMesa]);
      const cuentaDos = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [segundo.idMesa]);

      const emitido = await ay.uno(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER) AS ncf`,
        [cuentaUno, "Consumidor final", primero.idCajero],
      );

      await ay.sql("SELECT fn_anular_comprobante($1, $2::INTEGER)", [emitido.ncf, primero.idCajero]);

      const siguiente = await ay.uno(
        `SELECT fn_emitir_comprobante($1::INTEGER, 'B01'::tipo_comprobante, $2, $3::INTEGER) AS ncf`,
        [cuentaDos, "Consumidor final", segundo.idCajero],
      );

      expect(siguiente.ncf).not.toBe(emitido.ncf);
      expect(siguiente.ncf > emitido.ncf).toBe(true);
    });
  });
});

// =====================================================================================
describe("fn_cerrar_propinas (RN-12)", () => {
  it("calcula lo esperado sumando las propinas del día", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      await ay.sql(
        "INSERT INTO propina (id_empleado, id_mesa, monto, forma) VALUES ($1, $2, 250, 'Efectivo')",
        [s.idMesero, s.idMesa],
      );

      await ay.sql("SELECT fn_cerrar_propinas($1::INTEGER, CURRENT_DATE, $2::dinero)", [
        s.idMesero,
        240,
      ]);

      const cierre = await ay.uno(
        "SELECT esperado, contado, diferencia FROM cierre_propina WHERE id_empleado = $1",
        [s.idMesero],
      );

      expect(cierre.esperado).toBe(250);
      expect(cierre.contado).toBe(240);

      // El faltante (-10) es el motivo por el que existe la migración 009.
      // Antes de esa corrección, la columna "diferencia" usaba el dominio "dinero"
      // (que prohíbe negativos) y esta misma línea reventaba con un error de
      // restricción: el sistema no podía anotar que faltaba dinero.
      expect(cierre.diferencia).toBe(-10);
    });
  });

  it("no cierra dos veces las propinas del mismo empleado y día", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      await ay.sql("SELECT fn_cerrar_propinas($1::INTEGER, CURRENT_DATE, $2::dinero)", [
        s.idMesero,
        100,
      ]);

      const error = await ay.viola("SELECT fn_cerrar_propinas($1::INTEGER, CURRENT_DATE, $2::dinero)", [
        s.idMesero,
        100,
      ]);

      expect(error.code).toBe("23505");
    });
  });

  it("la versión con autor deja escrito quién cerró de verdad", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      await ay.sql(
        "INSERT INTO propina (id_empleado, id_mesa, monto, forma) VALUES ($1, $2, 200, 'Efectivo')",
        [s.idMesero, s.idMesa],
      );

      // La migración 015 agregó la versión que recibe al capitán como cuarto
      // argumento; antes la función anotaba al propio mesero como autor.
      await ay.sql(
        "SELECT fn_cerrar_propinas($1::INTEGER, CURRENT_DATE, $2::dinero, $3::INTEGER)",
        [s.idMesero, 190, s.idCapitan],
      );

      const cierre = await ay.uno(
        "SELECT esperado, contado, diferencia, id_cerrado_por FROM cierre_propina WHERE id_empleado = $1",
        [s.idMesero],
      );

      expect(cierre.esperado).toBe(200);
      expect(cierre.contado).toBe(190);
      expect(cierre.diferencia).toBe(-10);
      expect(cierre.id_cerrado_por).toBe(s.idCapitan);
      expect(cierre.id_cerrado_por).not.toBe(s.idMesero);
    });
  });
});

// =====================================================================================
describe("fn_cerrar_corte (RN-11)", () => {
  it("reúne lo cobrado del día por forma de pago", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [1000] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 1200, s.idCajero],
      );

      const idCorte = await ay.numero("SELECT fn_cerrar_corte(CURRENT_DATE, $1::INTEGER)", [
        s.idCajero,
      ]);

      const corte = await ay.uno(
        "SELECT efectivo_sistema, total_ventas, estado, id_cerrado_por FROM corte_caja WHERE id_corte = $1",
        [idCorte],
      );

      // Se recibieron 1200 y se devolvieron 200 de cambio: quedaron 1000.
      expect(corte.efectivo_sistema).toBe(1000);
      expect(corte.total_ventas).toBe(1000);
      expect(corte.estado).toBe("Cerrado");
      expect(corte.id_cerrado_por).toBe(s.idCajero);
    });
  });

  it("cerrarlo dos veces actualiza el mismo corte en vez de duplicarlo", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [500] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 500, s.idCajero],
      );

      const primero = await ay.numero("SELECT fn_cerrar_corte(CURRENT_DATE, $1::INTEGER)", [s.idCajero]);
      const segundo = await ay.numero("SELECT fn_cerrar_corte(CURRENT_DATE, $1::INTEGER)", [s.idCajero]);

      const cortes = await ay.numero("SELECT count(*) FROM corte_caja WHERE fecha = CURRENT_DATE");

      expect(segundo).toBe(primero);
      expect(cortes).toBe(1);
    });
  });

  it("deja anotar un faltante de caja (diferencia negativa)", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [1000] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1::INTEGER)", [s.idMesa]);

      await ay.sql(
        `SELECT fn_cobrar_cuenta($1::INTEGER, 'Efectivo'::forma_pago, $2::dinero, $3::INTEGER)`,
        [idCuenta, 1000, s.idCajero],
      );

      const idCorte = await ay.numero("SELECT fn_cerrar_corte(CURRENT_DATE, $1::INTEGER)", [s.idCajero]);

      // El cajero declara 950 cuando el sistema dice que debía haber 1000:
      // faltan 50. Es el caso de la migración 009.
      await ay.sql("UPDATE corte_caja SET efectivo_declarado = 950 WHERE id_corte = $1", [idCorte]);

      const corte = await ay.uno("SELECT diferencia FROM corte_caja WHERE id_corte = $1", [idCorte]);

      expect(corte.diferencia).toBe(-50);
    });
  });
});
