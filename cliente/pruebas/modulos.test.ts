/*
  modulos.test.ts — el catálogo y el filtro por permisos.
*/

import { describe, expect, it } from "vitest";

import {
  GRUPOS,
  MODULOS,
  modulosPermitidos,
  modulosPorGrupo,
} from "../src/modulos";

describe("modulosPermitidos", () => {
  it("sin permisos no devuelve ninguna pantalla (se niega por defecto)", () => {
    expect(modulosPermitidos([])).toEqual([]);
  });

  it("devuelve solo la pantalla cuyo permiso está en la lista", () => {
    const permitidos = modulosPermitidos(["ADMINISTRAR_PERSONAL"]);

    expect(permitidos).toHaveLength(1);
    expect(permitidos[0]?.ruta).toBe("/personal");
  });

  it("el mesero ve Pedidos y Propinas", () => {
    const permitidos = modulosPermitidos([
      "ASIGNAR_MESA",
      "CAPTURAR_PEDIDO",
      "MARCAR_ENTREGA",
      "REGISTRAR_PROPINA",
      "VER_DISPONIBILIDAD",
      "VER_MESAS",
    ]);

    expect(permitidos.map((modulo) => modulo.nombre)).toEqual([
      "Mesas y reservas",
      "Pedidos",
      "Propinas",
    ]);
  });

  it("cada módulo pide un permiso y dice en qué fase llega", () => {
    for (const modulo of MODULOS) {
      expect(modulo.permiso).toMatch(/^[A-Z_]+$/);
      expect(modulo.fase).toBeGreaterThanOrEqual(4);
      expect(modulo.ruta.startsWith("/")).toBe(true);
      expect(typeof modulo.disponible).toBe("boolean");
    }
  });

  it("Personal, Productos, Mesas, Inventario, Pedidos, Cocina, Propinas, Cuentas, Facturación, Corte, Reportes, Integraciones, Ofertas y Bitácora ya están disponibles; los demás siguen en su fase", () => {
    const personal = MODULOS.find((modulo) => modulo.ruta === "/personal");
    const productos = MODULOS.find((modulo) => modulo.ruta === "/productos");
    const mesas = MODULOS.find((modulo) => modulo.ruta === "/mesas");
    const inventario = MODULOS.find((modulo) => modulo.ruta === "/inventario");
    const pedidos = MODULOS.find((modulo) => modulo.ruta === "/pedidos");
    const cocina = MODULOS.find((modulo) => modulo.ruta === "/cocina");
    const propinas = MODULOS.find((modulo) => modulo.ruta === "/propinas");
    const cuentas = MODULOS.find((modulo) => modulo.ruta === "/cuentas");
    const facturacion = MODULOS.find((modulo) => modulo.ruta === "/facturacion");
    const corte = MODULOS.find((modulo) => modulo.ruta === "/corte");
    const bitacora = MODULOS.find((modulo) => modulo.ruta === "/bitacora");
    const reportes = MODULOS.find((modulo) => modulo.ruta === "/reportes");
    const integraciones = MODULOS.find(
      (modulo) => modulo.ruta === "/integraciones",
    );
    const ofertas = MODULOS.find((modulo) => modulo.ruta === "/ofertas");

    expect(personal?.disponible).toBe(true);
    expect(productos?.disponible).toBe(true);
    expect(mesas?.disponible).toBe(true);
    expect(inventario?.disponible).toBe(true);
    expect(pedidos?.disponible).toBe(true);
    expect(pedidos?.permiso).toBe("CAPTURAR_PEDIDO");
    expect(cocina?.disponible).toBe(true);
    expect(cocina?.permiso).toBe("CONFIRMAR_PREPARACION");
    expect(propinas?.disponible).toBe(true);
    expect(propinas?.permiso).toBe("REGISTRAR_PROPINA");
    expect(cuentas?.disponible).toBe(true);
    expect(cuentas?.permiso).toBe("GENERAR_CUENTA");
    expect(facturacion?.disponible).toBe(true);
    expect(facturacion?.permiso).toBe("EMITIR_COMPROBANTE");
    expect(corte?.disponible).toBe(true);
    expect(corte?.permiso).toBe("REALIZAR_CORTE");
    expect(bitacora?.disponible).toBe(true);
    expect(bitacora?.permiso).toBe("CONSULTAR_BITACORA");
    expect(reportes?.disponible).toBe(true);
    expect(reportes?.permiso).toBe("CONSULTAR_REPORTES");
    expect(integraciones?.disponible).toBe(true);
    expect(integraciones?.permiso).toBe("ADMINISTRAR_PARAMETROS");
    expect(ofertas?.disponible).toBe(true);
    expect(ofertas?.permiso).toBe("ADMINISTRAR_PROMOCIONES");
    expect(
      MODULOS.filter((modulo) => modulo.disponible).map((modulo) => modulo.ruta),
    ).toEqual([
      "/personal",
      "/productos",
      "/mesas",
      "/inventario",
      "/pedidos",
      "/cocina",
      "/propinas",
      "/cuentas",
      "/facturacion",
      "/corte",
      "/reportes",
      "/integraciones",
      "/ofertas",
      "/bitacora",
    ]);
  });

  it("no hay dos módulos con la misma ruta", () => {
    const rutas = MODULOS.map((modulo) => modulo.ruta);

    expect(new Set(rutas).size).toBe(rutas.length);
  });
});

describe("modulosPorGrupo", () => {
  it("cada módulo pertenece a una sección conocida", () => {
    for (const modulo of MODULOS) {
      expect(GRUPOS).toContain(modulo.grupo);
    }
  });

  it("devuelve las secciones en el orden del menú y sin secciones vacías", () => {
    const todos = MODULOS.map((modulo) => modulo.permiso);
    const secciones = modulosPorGrupo(todos).map((seccion) => seccion.grupo);

    expect(secciones).toEqual(GRUPOS.filter((g) => secciones.includes(g)));
    expect(secciones[0]).toBe("Salón");
  });

  it("una persona de cocina solo ve la sección Cocina", () => {
    const cocina = MODULOS.find((modulo) => modulo.ruta === "/cocina")!;
    const secciones = modulosPorGrupo([cocina.permiso]);

    expect(secciones.map((seccion) => seccion.grupo)).toEqual(["Cocina"]);
  });

  it("no ofrece módulos que todavía no existen", () => {
    const todos = MODULOS.map((modulo) => modulo.permiso);
    const rutas = modulosPorGrupo(todos).flatMap((seccion) =>
      seccion.modulos.map((modulo) => modulo.ruta),
    );

    expect(rutas).not.toContain("/parametros");
  });
});
