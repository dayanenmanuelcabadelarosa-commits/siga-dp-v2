/*
  Reglas de negocio, probadas contra PostgreSQL de verdad.
  --------------------------------------------------------

  Una prueba por regla, y dentro de cada regla se intenta hacer exactamente lo
  que la regla prohíbe, para comprobar que la base lo rechaza. Están numeradas
  igual que docs/reglas-de-negocio.md, así que se pueden leer en paralelo.

  Códigos de error de PostgreSQL que se comprueban:
    23505  llave duplicada (índice único)
    23514  restricción de comprobación (CHECK o dominio)
    23502  columna obligatoria vacía (NOT NULL)
    23503  llave foránea rota (FK)
    42501  permiso denegado (es el código que usan los triggers que bloquean)
*/

import { afterAll, describe, expect, it } from "vitest";

import { cerrarPool, conBaseDePrueba } from "./ayudas/base-de-prueba.js";

afterAll(async () => {
  await cerrarPool();
});

// =====================================================================================
describe("RN-01 — Un pedido abierto por mesa", () => {
  it("rechaza un segundo pedido abierto en la misma mesa", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      const error = await ay.viola(
        "INSERT INTO pedido (id_mesa, id_mesero, estado) VALUES ($1, $2, 'Abierto')",
        [s.idMesa, s.idMesero],
      );

      expect(error.code).toBe("23505");
    });
  });

  it("sí permite un pedido nuevo cuando el anterior ya se cerró", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      await ay.sql(
        "UPDATE pedido SET estado = 'Cerrado', cerrado_en = now() WHERE id_pedido = $1",
        [s.idPedido],
      );

      const nuevoId = await ay.numero(
        "INSERT INTO pedido (id_mesa, id_mesero, estado) VALUES ($1, $2, 'Abierto') RETURNING id_pedido",
        [s.idMesa, s.idMesero],
      );

      expect(nuevoId).toBeGreaterThan(s.idPedido);
    });
  });
});

// =====================================================================================
describe("RN-02 — El precio y el nombre se copian", () => {
  it("el precio de la línea no cambia si después cambia el del producto", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });
      const linea = s.lineas[0];

      await ay.sql("UPDATE producto SET precio = 9999.99 WHERE id_producto = $1", [
        linea.idProducto,
      ]);

      const guardada = await ay.uno(
        "SELECT precio_unitario FROM linea_pedido WHERE id_linea_pedido = $1",
        [linea.idLineaPedido],
      );

      expect(guardada.precio_unitario).toBe(linea.precio);
    });
  });

  it("la cuenta copia el nombre y el precio, y no los sigue cambiando", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });
      const linea = s.lineas[0];

      const antes = await ay.uno("SELECT nombre FROM producto WHERE id_producto = $1", [
        linea.idProducto,
      ]);

      const idCuenta = await ay.generarCuenta(s.idMesa);

      // Después de facturar, el producto cambia de nombre y de precio.
      await ay.sql("UPDATE producto SET nombre = 'Nombre cambiado', precio = 5000 WHERE id_producto = $1", [
        linea.idProducto,
      ]);

      const enLaCuenta = await ay.uno(
        "SELECT descripcion, precio_unitario FROM linea_cuenta WHERE id_cuenta = $1",
        [idCuenta],
      );

      expect(enLaCuenta.descripcion).toBe(antes.nombre);
      expect(enLaCuenta.precio_unitario).toBe(linea.precio);
    });
  });
});

// =====================================================================================
describe("RN-03 — El mesero de la orden recibe la propina", () => {
  it("al abrir el pedido queda anotado el mesero en el pedido y en la mesa", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      const pedido = await ay.uno("SELECT id_mesero FROM pedido WHERE id_pedido = $1", [s.idPedido]);
      const mesa = await ay.uno("SELECT id_mesero_orden, estado_pedido FROM mesa WHERE id_mesa = $1", [
        s.idMesa,
      ]);

      expect(pedido.id_mesero).toBe(s.idMesero);
      expect(mesa.id_mesero_orden).toBe(s.idMesero);
      expect(mesa.estado_pedido).toBe("Tomando pedido");
    });
  });
});

// =====================================================================================
describe("RN-04 — Una propina por mesa y empleado y día", () => {
  it("rechaza dos propinas del mismo empleado en la misma mesa el mismo día", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      await ay.sql(
        "INSERT INTO propina (id_empleado, id_mesa, monto, forma) VALUES ($1, $2, 100, 'Efectivo')",
        [s.idMesero, s.idMesa],
      );

      const error = await ay.viola(
        "INSERT INTO propina (id_empleado, id_mesa, monto, forma) VALUES ($1, $2, 50, 'Efectivo')",
        [s.idMesero, s.idMesa],
      );

      expect(error.code).toBe("23505");
    });
  });

  it("HOY sí admite que otro empleado registre propina en la misma mesa el mismo día", async () => {
    // Esto documenta la contradicción que está anotada como decisión pendiente
    // (docs/reglas-de-negocio.md, sección 5, punto 11). La prueba no dice que esté
    // bien: dice cómo se comporta hoy la base, para que el día que se decida lo
    // contrario haya que cambiarla a propósito.
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      await ay.sql(
        "INSERT INTO propina (id_empleado, id_mesa, monto, forma) VALUES ($1, $2, 100, 'Efectivo')",
        [s.idMesero, s.idMesa],
      );

      await ay.sql(
        "INSERT INTO propina (id_empleado, id_mesa, monto, forma) VALUES ($1, $2, 50, 'Efectivo')",
        [s.idCajero, s.idMesa],
      );

      const cuantas = await ay.numero(
        "SELECT count(*) FROM propina WHERE id_mesa = $1 AND DATE(registrada_en) = CURRENT_DATE",
        [s.idMesa],
      );

      expect(cuantas).toBe(2);
    });
  });
});

// =====================================================================================
describe("RN-05 — Una cuenta por mesa", () => {
  it("rechaza dos cuentas abiertas en la misma mesa", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      await ay.generarCuenta(s.idMesa);

      // Se fuerza otra cuenta abierta en la misma mesa con otro pedido, para
      // aislar la regla de "una cuenta por pedido".
      const otroPedido = await ay.numero(
        `INSERT INTO pedido (id_mesa, id_mesero, estado, cerrado_en)
         VALUES ($1, $2, 'Cerrado', now()) RETURNING id_pedido`,
        [s.idMesa, s.idMesero],
      );

      const error = await ay.viola(
        "INSERT INTO cuenta (id_mesa, id_pedido, id_mesero) VALUES ($1, $2, $3)",
        [s.idMesa, otroPedido, s.idMesero],
      );

      expect(error.code).toBe("23505");
    });
  });

  it("rechaza dos cuentas del mismo pedido", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      await ay.generarCuenta(s.idMesa);

      const error = await ay.viola(
        "INSERT INTO cuenta (id_mesa, id_pedido, id_mesero) VALUES ($1, $2, $3)",
        [s.idMesa, s.idPedido, s.idMesero],
      );

      expect(error.code).toBe("23505");
    });
  });
});

// =====================================================================================
describe("RN-06 — Una cuenta pagada no se toca", () => {
  it("una cuenta pagada no puede quedar sin fecha de cierre", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const error = await ay.viola("UPDATE cuenta SET estado = 'Pagada' WHERE id_cuenta = $1", [
        idCuenta,
      ]);

      expect(error.code).toBe("23514");
    });
  });

  it("una cuenta no se cobra dos veces", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      await ay.sql(
        "INSERT INTO pago (id_cuenta, forma_pago, monto_recibido, id_cajero) VALUES ($1, 'Efectivo', 500, $2)",
        [idCuenta, s.idCajero],
      );

      const error = await ay.viola(
        "INSERT INTO pago (id_cuenta, forma_pago, monto_recibido, id_cajero) VALUES ($1, 'Efectivo', 500, $2)",
        [idCuenta, s.idCajero],
      );

      expect(error.code).toBe("23505");
    });
  });
});

// =====================================================================================
describe("RN-07 — Descuentos y cortesías con autorizante", () => {
  it("rechaza un descuento sin quien lo autorice", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const error = await ay.viola(
        "INSERT INTO descuento (id_cuenta, concepto, monto, tipo) VALUES ($1, 'Sin autorizante', 50, 'Descuento')",
        [idCuenta],
      );

      expect(error.code).toBe("23502");
    });
  });

  it("rechaza un descuento de monto cero o negativo", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const error = await ay.viola(
        `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
         VALUES ($1, 'Monto inválido', 0, 'Descuento', $2)`,
        [idCuenta, s.idCapitan],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("acepta un descuento con su autorizante", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      await ay.sql(
        `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
         VALUES ($1, 'Descuento de prueba', 50, 'Descuento', $2)`,
        [idCuenta, s.idCapitan],
      );

      const total = await ay.numero("SELECT fn_total_cuenta($1)", [idCuenta]);
      expect(total).toBe(s.total - 50);
    });
  });
});

// =====================================================================================
describe("RN-08 — El número fiscal no se reutiliza", () => {
  it("rechaza dos comprobantes con el mismo número", async () => {
    await conBaseDePrueba(async (ay) => {
      const primero = await ay.servicio();
      const idCuentaUno = await ay.generarCuenta(primero.idMesa);
      const segundo = await ay.servicio();
      const idCuentaDos = await ay.generarCuenta(segundo.idMesa);

      const emitidos = [];
      for (const [idCuenta, cajero] of [
        [idCuentaUno, primero.idCajero],
        [idCuentaDos, segundo.idCajero],
      ]) {
        emitidos.push(
          await ay.uno(
            `INSERT INTO comprobante (tipo, id_cuenta, cliente, base, impuesto, total, forma_pago, id_emitido_por)
             VALUES ('B01', $1, 'Cliente', 84.75, 15.25, 100, 'Efectivo', $2)
             RETURNING id_comprobante, numero_ncf`,
            [idCuenta, cajero],
          ),
        );
      }

      // Nota: no se puede probar esto insertando un NCF repetido, porque
      // trg_numerar_comprobante SIEMPRE sobrescribe el número con el siguiente de
      // la secuencia. Esa es justamente la primera defensa de la regla. La
      // segunda es el índice único, y esa se prueba intentando dejar dos
      // comprobantes con el mismo número a mano.
      const error = await ay.viola("UPDATE comprobante SET numero_ncf = $1 WHERE id_comprobante = $2", [
        emitidos[0].numero_ncf,
        emitidos[1].id_comprobante,
      ]);

      expect(emitidos[0].numero_ncf).not.toBe(emitidos[1].numero_ncf);
      expect(error.code).toBe("23505");
    });
  });

  it("la secuencia no puede saltarse un número", async () => {
    await conBaseDePrueba(async (ay) => {
      // ck_secuencia_coherente: siguiente_numero = ultimo_numero + 1
      const error = await ay.viola(
        "UPDATE secuencia_ncf SET siguiente_numero = ultimo_numero + 5 WHERE tipo = 'B01'",
      );

      expect(error.code).toBe("23514");
    });
  });
});

// =====================================================================================
describe("RN-09 — Anular no es borrar", () => {
  it("un comprobante anulado exige fecha de anulación", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const error = await ay.viola(
        `INSERT INTO comprobante (tipo, id_cuenta, cliente, base, impuesto, total, forma_pago, id_emitido_por, estado)
         VALUES ('B01', $1, 'Cliente', 84.75, 15.25, 100, 'Efectivo', $2, 'Anulado')`,
        [idCuenta, s.idCajero],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("un comprobante emitido no puede tener fecha de anulación", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const error = await ay.viola(
        `INSERT INTO comprobante (tipo, id_cuenta, cliente, base, impuesto, total, forma_pago, id_emitido_por, anulado_en)
         VALUES ('B01', $1, 'Cliente', 84.75, 15.25, 100, 'Efectivo', $2, now())`,
        [idCuenta, s.idCajero],
      );

      expect(error.code).toBe("23514");
    });
  });
});

// =====================================================================================
describe("RN-10 — El impuesto se calcula con la tasa vigente", () => {
  it("rechaza un comprobante cuyo total no es base más impuesto", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const error = await ay.viola(
        `INSERT INTO comprobante (tipo, id_cuenta, cliente, base, impuesto, total, forma_pago, id_emitido_por)
         VALUES ('B01', $1, 'Cliente', 50, 15, 100, 'Efectivo', $2)`,
        [idCuenta, s.idCajero],
      );

      expect(error.code).toBe("23514");
    });
  });
});

// =====================================================================================
describe("RN-11 — Un corte por fecha", () => {
  it("rechaza dos cortes de caja para la misma fecha", async () => {
    await conBaseDePrueba(async (ay) => {
      await ay.sql("INSERT INTO corte_caja (fecha) VALUES (DATE '2026-01-15')");

      const error = await ay.viola("INSERT INTO corte_caja (fecha) VALUES (DATE '2026-01-15')");

      expect(error.code).toBe("23505");
    });
  });
});

// =====================================================================================
describe("RN-12 — Una conciliación de propinas por mesero y fecha", () => {
  it("rechaza dos conciliaciones del mismo empleado y fecha", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      await ay.sql(
        `INSERT INTO cierre_propina (id_empleado, fecha, esperado, contado, id_cerrado_por)
         VALUES ($1, DATE '2026-02-10', 100, 100, $1)`,
        [s.idMesero],
      );

      const error = await ay.viola(
        `INSERT INTO cierre_propina (id_empleado, fecha, esperado, contado, id_cerrado_por)
         VALUES ($1, DATE '2026-02-10', 50, 50, $1)`,
        [s.idMesero],
      );

      expect(error.code).toBe("23505");
    });
  });
});

// =====================================================================================
describe("RN-13 — La existencia no queda negativa", () => {
  it("rechaza una salida que dejaría la existencia en negativo", async () => {
    await conBaseDePrueba(async (ay) => {
      const idInsumo = await ay.insumo();
      const idPunto = await ay.punto();

      await ay.sql(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Ajuste por conteo', $1, $2, 10, 'Conteo inicial')`,
        [idInsumo, idPunto],
      );

      const error = await ay.viola(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Salida por consumo', $1, $2, -25, 'Consumo del día')`,
        [idInsumo, idPunto],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("la existencia no se puede escribir en negativo a mano", async () => {
    await conBaseDePrueba(async (ay) => {
      const idInsumo = await ay.insumo();
      const idPunto = await ay.punto();

      await ay.sql(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Ajuste por conteo', $1, $2, 10, 'Conteo inicial')`,
        [idInsumo, idPunto],
      );

      const error = await ay.viola(
        "UPDATE existencia SET existencia = -1 WHERE id_insumo = $1 AND id_punto = $2",
        [idInsumo, idPunto],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("el movimiento de inventario ya registrado no se modifica ni se borra", async () => {
    await conBaseDePrueba(async (ay) => {
      const idInsumo = await ay.insumo();
      const idPunto = await ay.punto();

      const idMovimiento = await ay.numero(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Ajuste por conteo', $1, $2, 10, 'Conteo inicial') RETURNING id_movimiento`,
        [idInsumo, idPunto],
      );

      const alModificar = await ay.viola(
        "UPDATE movimiento_inventario SET cantidad = 99 WHERE id_movimiento = $1",
        [idMovimiento],
      );
      const alBorrar = await ay.viola("DELETE FROM movimiento_inventario WHERE id_movimiento = $1", [
        idMovimiento,
      ]);

      expect(alModificar.code).toBe("42501");
      expect(alBorrar.code).toBe("42501");
    });
  });
});

// =====================================================================================
describe("RN-14 — El ajuste guarda la diferencia", () => {
  it("acepta una diferencia negativa y la aplica a la existencia", async () => {
    await conBaseDePrueba(async (ay) => {
      const idInsumo = await ay.insumo();
      const idPunto = await ay.punto();

      await ay.sql(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Ajuste por conteo', $1, $2, 10, 'Conteo inicial')`,
        [idInsumo, idPunto],
      );

      await ay.sql(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Ajuste por conteo', $1, $2, -4, 'Faltaron cuatro')`,
        [idInsumo, idPunto],
      );

      const existencia = await ay.uno(
        "SELECT existencia FROM existencia WHERE id_insumo = $1 AND id_punto = $2",
        [idInsumo, idPunto],
      );
      expect(existencia.existencia).toBe(6);

      const ultimo = await ay.uno(
        `SELECT cantidad FROM movimiento_inventario
          WHERE id_insumo = $1 AND id_punto = $2
          ORDER BY id_movimiento DESC LIMIT 1`,
        [idInsumo, idPunto],
      );
      expect(ultimo.cantidad).toBe(-4);
    });
  });

  it("rechaza un movimiento de cantidad cero", async () => {
    await conBaseDePrueba(async (ay) => {
      const idInsumo = await ay.insumo();
      const idPunto = await ay.punto();

      const error = await ay.viola(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Ajuste por conteo', $1, $2, 0, 'Nada')`,
        [idInsumo, idPunto],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("una salida por consumo no puede ser positiva", async () => {
    await conBaseDePrueba(async (ay) => {
      const idInsumo = await ay.insumo();
      const idPunto = await ay.punto();

      const error = await ay.viola(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Salida por consumo', $1, $2, 5, 'Al revés')`,
        [idInsumo, idPunto],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("una entrada de compra exige el proveedor", async () => {
    await conBaseDePrueba(async (ay) => {
      const idInsumo = await ay.insumo();
      const idPunto = await ay.punto();

      const error = await ay.viola(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle)
         VALUES ('Entrada de compra', $1, $2, 20, 'Compra sin proveedor')`,
        [idInsumo, idPunto],
      );

      expect(error.code).toBe("23514");
    });
  });
});

// =====================================================================================
describe("RN-15 — Una zona con mesas no se elimina", () => {
  it("no deja borrar una zona que tiene mesas", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      const error = await ay.viola("DELETE FROM zona WHERE id_zona = $1", [s.idZona]);

      // 23001 (restrict_violation): es el código que usa PostgreSQL cuando la
      // llave foránea se declaró ON DELETE RESTRICT. Con NO ACTION sería 23503,
      // que también impide el borrado. Los dos significan "no se puede, hay
      // mesas apuntando aquí".
      expect(error.code).toBe("23001");
    });
  });

  it("la llave foránea está declarada RESTRICT y no CASCADE ni SET NULL", async () => {
    await conBaseDePrueba(async (ay) => {
      // confdeltype: 'r' = RESTRICT, 'a' = NO ACTION, 'c' = CASCADE, 'n' = SET NULL
      const regla = await ay.uno(
        `SELECT conf.confdeltype
           FROM pg_constraint conf
           JOIN pg_class tabla ON tabla.oid = conf.conrelid
          WHERE tabla.relname = 'mesa' AND conf.contype = 'f'
            AND conf.conname = 'mesa_id_zona_fkey'`,
      );

      expect(regla.confdeltype).toBe("r");
    });
  });
});

// =====================================================================================
describe("RN-16 — Producto, proveedor y empleado no se borran", () => {
  it("rechaza borrar un producto que ya tiene ventas", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      const error = await ay.viola("DELETE FROM producto WHERE id_producto = $1", [
        s.lineas[0].idProducto,
      ]);

      expect(error.code).toBe("23514");
      expect(error.message).toMatch(/ya tiene ventas/i);
    });
  });

  it("rechaza borrar un producto aunque no tenga ventas", async () => {
    await conBaseDePrueba(async (ay) => {
      const idProducto = await ay.producto();

      const error = await ay.viola("DELETE FROM producto WHERE id_producto = $1", [idProducto]);

      expect(error.code).toBe("42501");
    });
  });

  it("rechaza borrar un proveedor aunque no tenga compras", async () => {
    await conBaseDePrueba(async (ay) => {
      const idProveedor = await ay.proveedor();

      const error = await ay.viola("DELETE FROM proveedor WHERE id_proveedor = $1", [idProveedor]);

      expect(error.code).toBe("42501");
      expect(error.message).toMatch(/desactívelo/i);
    });
  });

  it("rechaza borrar un proveedor que ya tiene compras, y explica por qué", async () => {
    // Este es el caso que preocupaba: borrarlo dejaría las compras sin saber a
    // quién se le hicieron.
    await conBaseDePrueba(async (ay) => {
      const idProveedor = await ay.proveedor();
      const idInsumo = await ay.insumo();
      const idPunto = await ay.punto();

      await ay.sql(
        `INSERT INTO movimiento_inventario (tipo, id_insumo, id_punto, cantidad, detalle, id_proveedor)
         VALUES ('Entrada de compra', $1, $2, 20, 'Compra al proveedor', $3)`,
        [idInsumo, idPunto, idProveedor],
      );

      const error = await ay.viola("DELETE FROM proveedor WHERE id_proveedor = $1", [idProveedor]);

      expect(error.code).toBe("23514");
      expect(error.message).toMatch(/ya tiene 1 movimiento/i);
    });
  });

  it("rechaza borrar un empleado aunque no tenga historial", async () => {
    await conBaseDePrueba(async (ay) => {
      const idEmpleado = await ay.empleado();

      const error = await ay.viola("DELETE FROM empleado WHERE id_empleado = $1", [idEmpleado]);

      expect(error.code).toBe("42501");
      expect(error.message).toMatch(/délo de baja/i);
    });
  });

  it("rechaza borrar un empleado que ya atendió mesas", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      const error = await ay.viola("DELETE FROM empleado WHERE id_empleado = $1", [s.idMesero]);

      expect(error.code).toBe("23514");
      expect(error.message).toMatch(/ya tiene historial de servicio/i);
    });
  });

  it("un empleado con cuenta de acceso no se borra (se perdería la cuenta con él)", async () => {
    await conBaseDePrueba(async (ay) => {
      const idUsuario = await ay.usuario({ nombre: "con-cuenta" });

      const error = await ay.viola(
        `DELETE FROM empleado
          WHERE id_empleado = (SELECT id_empleado FROM usuario WHERE id_usuario = $1)`,
        [idUsuario],
      );

      expect(error.code).toBe("42501");
      expect(error.message).toMatch(/se borraría con él/i);
    });
  });

  it("dar de baja sí funciona: es la salida que la regla propone", async () => {
    await conBaseDePrueba(async (ay) => {
      const idProveedor = await ay.proveedor();
      const s = await ay.servicio({ cuantasLineas: 1 });

      await ay.sql("UPDATE proveedor SET estado = 'Inactivo' WHERE id_proveedor = $1", [idProveedor]);
      await ay.sql("UPDATE empleado  SET estado = 'Inactivo' WHERE id_empleado = $1", [s.idMesero]);

      const proveedor = await ay.uno("SELECT estado FROM proveedor WHERE id_proveedor = $1", [
        idProveedor,
      ]);
      const empleado = await ay.uno("SELECT estado FROM empleado WHERE id_empleado = $1", [
        s.idMesero,
      ]);

      expect(proveedor.estado).toBe("Inactivo");
      expect(empleado.estado).toBe("Inactivo");
    });
  });
});

// =====================================================================================
describe("RN-17 — Nombres únicos", () => {
  it("rechaza dos productos con el mismo nombre", async () => {
    await conBaseDePrueba(async (ay) => {
      const nombre = "Producto repetido";
      await ay.producto({ nombre });

      const error = await ay.viola(
        `INSERT INTO producto (nombre, id_categoria, id_estacion, precio)
         SELECT $1, id_categoria, id_estacion, 100 FROM producto LIMIT 1`,
        [nombre],
      );

      expect(error.code).toBe("23505");
    });
  });

  it("rechaza dos proveedores con el mismo nombre", async () => {
    await conBaseDePrueba(async (ay) => {
      const nombre = "Proveedor repetido";
      await ay.proveedor({ nombre });

      const error = await ay.viola(
        "INSERT INTO proveedor (nombre, telefono) VALUES ($1, '809-000-0000')",
        [nombre],
      );

      expect(error.code).toBe("23505");
    });
  });
});

// =====================================================================================
describe("RN-18 — Usuario y cédula únicos", () => {
  it("rechaza dos empleados con la misma cédula", async () => {
    await conBaseDePrueba(async (ay) => {
      const cedula = "C-REPETIDA";
      await ay.empleado({ cedula });

      const error = await ay.viola(
        `INSERT INTO empleado (cedula, nombre, id_rol)
         SELECT $1, 'Otro', id_rol FROM empleado LIMIT 1`,
        [cedula],
      );

      expect(error.code).toBe("23505");
    });
  });

  it("rechaza dos usuarios con el mismo nombre de usuario", async () => {
    await conBaseDePrueba(async (ay) => {
      const nombre = "usuario-repetido";
      await ay.usuario({ nombre });

      const error = await ay.viola(
        `INSERT INTO usuario (usuario, clave_hash, id_empleado)
         VALUES ($1, 'x', $2)`,
        [nombre, await ay.empleado()],
      );

      expect(error.code).toBe("23505");
    });
  });

  it("rechaza dos cuentas de acceso para el mismo empleado", async () => {
    await conBaseDePrueba(async (ay) => {
      const idEmpleado = await ay.empleado();
      await ay.usuario({ idEmpleado, nombre: "uno" });

      const error = await ay.viola(
        "INSERT INTO usuario (usuario, clave_hash, id_empleado) VALUES ('dos', 'x', $1)",
        [idEmpleado],
      );

      expect(error.code).toBe("23505");
    });
  });
});

// =====================================================================================
describe("RN-19 — La tasa de impuesto no es cero", () => {
  it("rechaza una tasa de impuesto de cero", async () => {
    await conBaseDePrueba(async (ay) => {
      const error = await ay.viola(
        `INSERT INTO parametro (nombre_empresa, rnc, direccion, telefono, tasa_impuesto)
         VALUES ('Otro local', '999-99999-9', 'Calle', '809-000-0000', 0)`,
      );

      expect(error.code).toBe("23514");
    });
  });

  it("rechaza una tasa de impuesto mayor que 100", async () => {
    await conBaseDePrueba(async (ay) => {
      const error = await ay.viola(
        `INSERT INTO parametro (nombre_empresa, rnc, direccion, telefono, tasa_impuesto)
         VALUES ('Otro local', '999-99999-8', 'Calle', '809-000-0000', 118)`,
      );

      expect(error.code).toBe("23514");
    });
  });
});

// =====================================================================================
describe("RN-20 — La mesa no se sobrepasa", () => {
  it("rechaza ocupar una mesa con más personas que su capacidad", async () => {
    await conBaseDePrueba(async (ay) => {
      const idMesa = await ay.mesa({ capacidad: 4 });

      const error = await ay.viola(
        "UPDATE mesa SET estado = 'ocupada', personas = 5, hora_llegada = now() WHERE id_mesa = $1",
        [idMesa],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("una mesa ocupada no puede quedarse sin personas ni sin hora de llegada", async () => {
    await conBaseDePrueba(async (ay) => {
      const idMesa = await ay.mesa({ capacidad: 4 });

      const error = await ay.viola("UPDATE mesa SET estado = 'ocupada' WHERE id_mesa = $1", [idMesa]);

      expect(error.code).toBe("23514");
    });
  });

  it("rechaza una reserva para más personas que la capacidad de la mesa", async () => {
    await conBaseDePrueba(async (ay) => {
      const idMesa = await ay.mesa({ capacidad: 2 });

      const error = await ay.viola(
        `INSERT INTO reserva (fecha, hora, nombre_cliente, telefono, personas, id_mesa)
         VALUES (CURRENT_DATE + 1, '20:00', 'Cliente', '809-000-0000', 5, $1)`,
        [idMesa],
      );

      expect(error.code).toBe("23514");
      expect(error.message).toMatch(/capacidad para/i);
    });
  });
});

// =====================================================================================
describe("RN-21 — Una reserva viva por mesa y hora", () => {
  it("rechaza dos reservas vivas de la misma mesa a la misma hora", async () => {
    await conBaseDePrueba(async (ay) => {
      const idMesa = await ay.mesa();

      await ay.sql(
        `INSERT INTO reserva (fecha, hora, nombre_cliente, telefono, personas, id_mesa)
         VALUES (DATE '2026-03-01', TIME '19:00', 'Cliente uno', '809-111-1111', 2, $1)`,
        [idMesa],
      );

      const error = await ay.viola(
        `INSERT INTO reserva (fecha, hora, nombre_cliente, telefono, personas, id_mesa)
         VALUES (DATE '2026-03-01', TIME '19:00', 'Cliente dos', '809-222-2222', 2, $1)`,
        [idMesa],
      );

      expect(error.code).toBe("23505");
    });
  });

  it("una reserva cancelada deja libre la mesa a esa hora", async () => {
    await conBaseDePrueba(async (ay) => {
      const idMesa = await ay.mesa();

      await ay.sql(
        `INSERT INTO reserva (fecha, hora, nombre_cliente, telefono, personas, id_mesa)
         VALUES (DATE '2026-03-02', TIME '19:00', 'Cliente uno', '809-111-1111', 2, $1)`,
        [idMesa],
      );

      // Se cancela (con su motivo, RN-27 al revés) y la mesa queda libre.
      await ay.sql(
        `UPDATE reserva SET estado = 'Cancelada', motivo_cancelacion = 'El cliente avisó'
          WHERE id_mesa = $1`,
        [idMesa],
      );

      await ay.sql(
        `INSERT INTO reserva (fecha, hora, nombre_cliente, telefono, personas, id_mesa)
         VALUES (DATE '2026-03-02', TIME '19:00', 'Cliente dos', '809-222-2222', 2, $1)`,
        [idMesa],
      );

      const vivas = await ay.numero(
        "SELECT count(*) FROM reserva WHERE id_mesa = $1 AND estado <> 'Cancelada'",
        [idMesa],
      );

      expect(vivas).toBe(1);
    });
  });

  it("una reserva cancelada exige el motivo", async () => {
    await conBaseDePrueba(async (ay) => {
      const idMesa = await ay.mesa();

      const error = await ay.viola(
        `INSERT INTO reserva (fecha, hora, nombre_cliente, telefono, personas, id_mesa, estado)
         VALUES (DATE '2026-03-03', TIME '19:00', 'Cliente', '809-000-0000', 2, $1, 'Cancelada')`,
        [idMesa],
      );

      expect(error.code).toBe("23514");
    });
  });
});

// =====================================================================================
describe("RN-22 — Una promoción termina después de empezar", () => {
  it("rechaza una promoción que termina antes de empezar", async () => {
    await conBaseDePrueba(async (ay) => {
      const error = await ay.viola(
        `INSERT INTO promocion (nombre, descripcion, fecha_inicio, fecha_fin)
         VALUES ('Promo', 'Al revés', DATE '2026-04-10', DATE '2026-04-01')`,
      );

      expect(error.code).toBe("23514");
    });
  });

  it("HOY acepta una promoción que empieza y termina el mismo día", async () => {
    // El plan dice "posterior"; el CHECK dice ">= ". Es la decisión pendiente
    // número 8 (docs/reglas-de-negocio.md, sección 5).
    await conBaseDePrueba(async (ay) => {
      const id = await ay.numero(
        `INSERT INTO promocion (nombre, descripcion, fecha_inicio, fecha_fin)
         VALUES ('Promo de un día', 'Mismo día', DATE '2026-04-10', DATE '2026-04-10')
         RETURNING id_promocion`,
      );

      expect(id).toBeGreaterThan(0);
    });
  });
});

// =====================================================================================
describe("RN-23 — Dar de baja es inmediato", () => {
  it("un empleado dado de baja queda Inactivo y conserva su historial de ventas", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      await ay.sql("UPDATE empleado SET estado = 'Inactivo' WHERE id_empleado = $1", [s.idMesero]);

      const empleado = await ay.uno("SELECT estado FROM empleado WHERE id_empleado = $1", [
        s.idMesero,
      ]);
      const sigueEnElPedido = await ay.numero(
        "SELECT count(*) FROM pedido WHERE id_mesero = $1",
        [s.idMesero],
      );

      expect(empleado.estado).toBe("Inactivo");
      expect(sigueEnElPedido).toBe(1);
    });
  });
});

// =====================================================================================
describe("RN-24 — Tres intentos fallidos bloquean", () => {
  it("la cuenta guarda los intentos fallidos y su estado", async () => {
    await conBaseDePrueba(async (ay) => {
      const idUsuario = await ay.usuario({ nombre: "para-bloquear" });

      await ay.sql("UPDATE usuario SET intentos_fallidos = 3, estado = 'Bloqueado' WHERE id_usuario = $1", [
        idUsuario,
      ]);

      const cuenta = await ay.uno(
        "SELECT intentos_fallidos, estado FROM usuario WHERE id_usuario = $1",
        [idUsuario],
      );

      expect(cuenta.intentos_fallidos).toBe(3);
      expect(cuenta.estado).toBe("Bloqueado");
    });
  });
});

// =====================================================================================
describe("RN-25 — Las credenciales de la pasarela no se guardan", () => {
  it("la tabla de parámetros no tiene ninguna columna que parezca una credencial", async () => {
    await conBaseDePrueba(async (ay) => {
      const columnas = await ay.sql(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'parametro' ORDER BY 1`,
      );
      const nombres = columnas.map((columna) => columna.column_name);

      expect(nombres).not.toContain("clave");
      expect(nombres).not.toContain("clave_secreta");
      expect(nombres).not.toContain("secret");
      expect(nombres).not.toContain("token");
      expect(nombres).not.toContain("password");
      // cuenta_pagos se queda: es una cuenta pública de cobro, no una credencial.
      expect(nombres).toContain("cuenta_pagos");
    });
  });
});

// =====================================================================================
describe("RN-26 — La bitácora es de solo lectura", () => {
  it("rechaza modificar un registro de la bitácora", async () => {
    await conBaseDePrueba(async (ay) => {
      await ay.mesa();
      const idBitacora = await ay.numero("SELECT max(id_bitacora) FROM bitacora");

      const error = await ay.viola("UPDATE bitacora SET detalle = 'cambiado' WHERE id_bitacora = $1", [
        idBitacora,
      ]);

      expect(error.code).toBe("42501");
    });
  });

  it("rechaza borrar un registro de la bitácora", async () => {
    await conBaseDePrueba(async (ay) => {
      await ay.mesa();
      const idBitacora = await ay.numero("SELECT max(id_bitacora) FROM bitacora");

      const error = await ay.viola("DELETE FROM bitacora WHERE id_bitacora = $1", [idBitacora]);

      expect(error.code).toBe("42501");
    });
  });

  it("deja anotado quién hizo el cambio y sobre qué tabla", async () => {
    await conBaseDePrueba(async (ay) => {
      await ay.sql("SELECT set_config('app.usuario', 'gerente', true)");
      const idMesa = await ay.mesa();

      const anotado = await ay.uno(
        `SELECT usuario_nombre, accion, tabla_afectada, registro_afectado, id_usuario
           FROM bitacora WHERE tabla_afectada = 'mesa' AND registro_afectado = $1`,
        [String(idMesa)],
      );

      expect(anotado.usuario_nombre).toBe("gerente");
      expect(anotado.tabla_afectada).toBe("mesa");
      expect(anotado.id_usuario).not.toBeNull();
    });
  });

  it("si nadie inició sesión, anota 'sistema'", async () => {
    await conBaseDePrueba(async (ay) => {
      // Se borra lo que hubiera en la variable de sesión para esta transacción.
      await ay.sql("SELECT set_config('app.usuario', '', true)");
      const idMesa = await ay.mesa();

      const anotado = await ay.uno(
        `SELECT usuario_nombre FROM bitacora
          WHERE tabla_afectada = 'mesa' AND registro_afectado = $1`,
        [String(idMesa)],
      );

      expect(anotado.usuario_nombre).toBe("sistema");
    });
  });
});

// =====================================================================================
describe("RN-27 — La línea anulada guarda el motivo", () => {
  it("rechaza una línea de pedido anulada sin motivo", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      const error = await ay.viola(
        "UPDATE linea_pedido SET estado = 'Anulada' WHERE id_linea_pedido = $1",
        [s.lineas[0].idLineaPedido],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("rechaza una línea de comanda anulada sin motivo", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      const error = await ay.viola(
        `UPDATE linea_comanda SET estado = 'Anulada'
          WHERE id_comanda = $1`,
        [s.idComanda],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("acepta la anulación cuando lleva el motivo", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1 });

      await ay.sql(
        `UPDATE linea_pedido SET estado = 'Anulada', motivo_anulacion = 'El cliente cambió de idea'
          WHERE id_linea_pedido = $1`,
        [s.lineas[0].idLineaPedido],
      );

      const linea = await ay.uno("SELECT estado, motivo_anulacion FROM linea_pedido WHERE id_linea_pedido = $1", [
        s.lineas[0].idLineaPedido,
      ]);

      expect(linea.estado).toBe("Anulada");
      expect(linea.motivo_anulacion).toBe("El cliente cambió de idea");
    });
  });
});

// =====================================================================================
describe("RN-28 — Pago con tarjeta o PayPal exige referencia", () => {
  it("rechaza un pago con tarjeta sin referencia", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const error = await ay.viola(
        `INSERT INTO pago (id_cuenta, forma_pago, monto_recibido, id_cajero)
         VALUES ($1, 'Tarjeta', 500, $2)`,
        [idCuenta, s.idCajero],
      );

      expect(error.code).toBe("23514");
    });
  });

  it("acepta un pago con tarjeta cuando lleva la referencia", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      await ay.sql(
        `INSERT INTO pago (id_cuenta, forma_pago, monto_recibido, referencia, id_cajero)
         VALUES ($1, 'Tarjeta', 500, 'AUTORIZACION-123', $2)`,
        [idCuenta, s.idCajero],
      );

      const pago = await ay.uno("SELECT referencia FROM pago WHERE id_cuenta = $1", [idCuenta]);
      expect(pago.referencia).toBe("AUTORIZACION-123");
    });
  });

  it("HOY la propina por PayPal no exige referencia (la regla sí lo dice)", async () => {
    // Inconsistencia anotada como decisión pendiente número 9
    // (docs/reglas-de-negocio.md, sección 5): ck_propina_referencia solo cubre
    // Tarjeta, no PayPal.
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      await ay.sql(
        "INSERT INTO propina (id_empleado, id_mesa, monto, forma) VALUES ($1, $2, 100, 'PayPal')",
        [s.idMesero, s.idMesa],
      );

      const cuantas = await ay.numero(
        "SELECT count(*) FROM propina WHERE id_mesa = $1 AND forma = 'PayPal'",
        [s.idMesa],
      );

      expect(cuantas).toBe(1);
    });
  });

  it("rechaza una propina con tarjeta sin referencia", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      const error = await ay.viola(
        "INSERT INTO propina (id_empleado, id_mesa, monto, forma) VALUES ($1, $2, 100, 'Tarjeta')",
        [s.idMesero, s.idMesa],
      );

      expect(error.code).toBe("23514");
    });
  });
});

// =====================================================================================
describe("Correcciones de la auditoría (migración 007)", () => {
  it("un pedido Enviado no exige fecha de cierre", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      await ay.sql("UPDATE pedido SET estado = 'Enviado' WHERE id_pedido = $1", [s.idPedido]);

      const pedido = await ay.uno("SELECT estado, cerrado_en FROM pedido WHERE id_pedido = $1", [
        s.idPedido,
      ]);

      expect(pedido.estado).toBe("Enviado");
      expect(pedido.cerrado_en).toBeNull();
    });
  });

  it("un pedido Cerrado sí exige fecha de cierre", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();

      const error = await ay.viola("UPDATE pedido SET estado = 'Cerrado' WHERE id_pedido = $1", [
        s.idPedido,
      ]);

      expect(error.code).toBe("23514");
    });
  });

  it("la auditoría del descuento también registra la modificación y el borrado", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const idDescuento = await ay.numero(
        `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
         VALUES ($1, 'Descuento vigilado', 10, 'Descuento', $2) RETURNING id_descuento`,
        [idCuenta, s.idCapitan],
      );

      await ay.sql("UPDATE descuento SET monto = 20 WHERE id_descuento = $1", [idDescuento]);
      await ay.sql("DELETE FROM descuento WHERE id_descuento = $1", [idDescuento]);

      // La transacción de prueba está aislada, así que todo lo que haya en la
      // bitácora sobre la tabla "descuento" es de esta prueba.
      // (Ojo: fn_auditar anota el id de la CUENTA como registro afectado, porque
      // descuento tiene una columna id_cuenta y esa se busca antes que
      // id_descuento. Por eso aquí se cuenta por tabla, no por registro.)
      const movimientos = await ay.numero(
        "SELECT count(*) FROM bitacora WHERE tabla_afectada = 'descuento'",
      );

      // Tres: el alta, la modificación y el borrado.
      expect(movimientos).toBe(3);
    });
  });

  it("un cobro no puede tener dos comprobantes fiscales", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const idPago = await ay.numero(
        `INSERT INTO pago (id_cuenta, forma_pago, monto_recibido, id_cajero)
         VALUES ($1, 'Efectivo', 100, $2) RETURNING id_pago`,
        [idCuenta, s.idCajero],
      );

      const primero = await ay.uno(
        `INSERT INTO comprobante (tipo, id_cuenta, id_pago, cliente, base, impuesto, total, forma_pago, id_emitido_por)
         VALUES ('B01', $1, $2, 'Cliente', 84.75, 15.25, 100, 'Efectivo', $3) RETURNING id_comprobante`,
        [idCuenta, idPago, s.idCajero],
      );

      const error = await ay.viola(
        `INSERT INTO comprobante (tipo, id_cuenta, id_pago, cliente, base, impuesto, total, forma_pago, id_emitido_por)
         VALUES ('B02', $1, $2, 'Cliente', 84.75, 15.25, 100, 'Efectivo', $3)`,
        [idCuenta, idPago, s.idCajero],
      );

      expect(primero.id_comprobante).toBeGreaterThan(0);
      expect(error.code).toBe("23505");
    });
  });

  it("una cuenta dividida puede tener un comprobante por cobro", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idCuenta = await ay.generarCuenta(s.idMesa);

      const pagos = [];
      for (const comensal of [1, 2]) {
        pagos.push(
          await ay.numero(
            `INSERT INTO pago (id_cuenta, comensal, forma_pago, monto_recibido, id_cajero)
             VALUES ($1, $2, 'Efectivo', 50, $3) RETURNING id_pago`,
            [idCuenta, comensal, s.idCajero],
          ),
        );
      }

      for (const idPago of pagos) {
        await ay.sql(
          `INSERT INTO comprobante (tipo, id_cuenta, id_pago, cliente, base, impuesto, total, forma_pago, id_emitido_por)
           VALUES ('B02', $1, $2, 'Cliente', 42.38, 7.62, 50, 'Efectivo', $3)`,
          [idCuenta, idPago, s.idCajero],
        );
      }

      const cuantos = await ay.numero(
        "SELECT count(*) FROM comprobante WHERE id_cuenta = $1",
        [idCuenta],
      );

      expect(cuantos).toBe(2);
    });
  });

  it("la regla del comprobante único no estorba a las ventas de canal", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio();
      const idEmpleado = s.idCajero;

      const ventas = [];
      for (const canal of ["Delivery", "Para llevar"]) {
        ventas.push(
          await ay.numero(
            `INSERT INTO venta_canal (canal, nombre_cliente, total, id_registrado_por)
             VALUES ($1, 'Cliente de canal', 100, $2) RETURNING id_venta`,
            [canal, idEmpleado],
          ),
        );
      }

      for (const idVenta of ventas) {
        await ay.sql(
          `INSERT INTO comprobante (tipo, id_venta_canal, cliente, base, impuesto, total, forma_pago, id_emitido_por)
           VALUES ('B02', $1, 'Cliente de canal', 84.75, 15.25, 100, 'Efectivo', $2)`,
          [idVenta, idEmpleado],
        );
      }

      const cuantos = await ay.numero(
        "SELECT count(*) FROM comprobante WHERE id_cuenta IS NULL AND id_venta_canal IS NOT NULL",
      );

      expect(cuantos).toBe(2);
    });
  });

  it("los índices que la auditoría pedía existen", async () => {
    await conBaseDePrueba(async (ay) => {
      const esperados = [
        "ix_pedido_estado",
        "ix_pedido_abierto_en",
        "ix_cuenta_estado",
        "ix_cuenta_abierta_en",
        "ix_linea_pedido_estado",
        "ix_linea_comanda_estado",
        "ix_reserva_estado",
        "ix_comprobante_estado",
        "ix_pago_forma_pago",
        "ix_pago_pagado_en",
        "ix_bitacora_accion",
        "ix_bitacora_tabla",
        "uq_comprobante_por_pago",
        "uq_pago_cuenta_completo",
      ];

      const filas = await ay.sql("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
      const existentes = new Set(filas.map((fila) => fila.indexname));

      for (const indice of esperados) {
        expect(existentes.has(indice), `Falta el índice ${indice}`).toBe(true);
      }
    });
  });
});
