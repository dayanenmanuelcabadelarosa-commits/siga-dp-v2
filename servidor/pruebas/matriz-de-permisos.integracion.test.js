/*
  matriz-de-permisos.integracion.test.js — la matriz aprobada, fijada con clavos.
  ------------------------------------------------------------------------------

  Qué protege esta prueba
    La versión oficial de la matriz es el documento docs/reglas-de-negocio.md
    (sección 4.5), que es lo que el dueño aprobó. La migración 011 es la copia que
    vive en la base. Si las dos se separan —por un dedazo al escribir la migración,
    o porque alguien la edite después—, aquí se avisa.

    Por eso la prueba no lleva la matriz escrita a mano: LEE LA TABLA DEL DOCUMENTO
    y la compara, casilla por casilla, contra lo que hay en `rol_permiso`. Si el
    documento y la base se contradicen, esta prueba falla, y hay que decidir cuál
    de los dos está mal. El documento manda.

  Cómo lee la tabla
    El documento tiene la tabla en formato Markdown. Se busca la línea del
    encabezado, se toman las 28 filas que vienen después, y cada celda se traduce:
    "S" o "★S" es sí; "—" o "★—" es no.
*/

import fs from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { raizProyecto } from "../herramientas/comun.js";
import { cerrarPool, conBaseDePrueba } from "./ayudas/base-de-prueba.js";

const DOCUMENTO = path.join(raizProyecto, "docs", "reglas-de-negocio.md");

/** El orden de las columnas del documento. */
const ROLES = [
  { columna: "Dueño", codigo: "dueno" },
  { columna: "Gerente", codigo: "gerente" },
  { columna: "Capitán", codigo: "capitan" },
  { columna: "Mesero", codigo: "mesero" },
  { columna: "Anfitrión", codigo: "anfitrion" },
  { columna: "Cocina", codigo: "cocina" },
  { columna: "Cajero", codigo: "cajero" },
  { columna: "Almacén", codigo: "almacen" },
];

/** Lee la tabla de la sección 4.5 del documento. Devuelve un Map "rol|permiso" -> true/false. */
function leerMatrizDelDocumento() {
  const lineas = fs.readFileSync(DOCUMENTO, "utf8").split(/\r?\n/);

  const inicio = lineas.findIndex((linea) => linea.startsWith("| Permiso (los 28"));
  if (inicio === -1) {
    throw new Error(
      "No se encontró la tabla de la matriz en docs/reglas-de-negocio.md.\n" +
        "  Se esperaba una línea que empezara con \"| Permiso (los 28\".\n" +
        "  Si le cambió el título a la tabla, hay que ajustar esta prueba.",
    );
  }

  const matriz = new Map();

  // inicio + 1 es la línea de guiones del encabezado; las filas empiezan después.
  for (let i = inicio + 2; i < lineas.length; i += 1) {
    const linea = lineas[i].trim();
    if (!linea.startsWith("|")) break; // se acabó la tabla

    const celdas = linea
      .split("|")
      .slice(1, -1) // el primero y el último quedan vacíos por los bordes
      .map((celda) => celda.trim());

    const permiso = celdas[0].replaceAll("`", "").trim();
    if (celdas.length !== ROLES.length + 1) {
      throw new Error(`La fila de "${permiso}" tiene ${celdas.length - 1} columnas, no 8.`);
    }

    ROLES.forEach((rol, indice) => {
      const celda = celdas[indice + 1];
      // "S" o "★S" es sí. Cualquier otra cosa (una raya) es no. La estrella ya no
      // importa: marcaba lo que era interpretación antes de que el dueño aprobara.
      matriz.set(`${rol.codigo}|${permiso}`, celda.endsWith("S"));
    });
  }

  return matriz;
}

/** Lee la matriz que hay de verdad en la base. */
async function leerMatrizDeLaBase() {
  return conBaseDePrueba(async ({ sql }) => {
    const filas = await sql(
      `SELECT r.codigo AS rol, p.codigo AS permiso, rp.permitido
         FROM rol_permiso rp
         JOIN rol     r ON r.id_rol     = rp.id_rol
         JOIN permiso p ON p.id_permiso = rp.id_permiso`,
    );

    return new Map(filas.map((fila) => [`${fila.rol}|${fila.permiso}`, fila.permitido]));
  });
}

afterAll(async () => {
  await cerrarPool();
});

describe("La matriz de permisos aprobada por el dueño", () => {
  it("la tabla del documento tiene los 8 roles y las 28 operaciones", () => {
    const matriz = leerMatrizDelDocumento();

    expect(matriz.size).toBe(28 * 8);
  });

  it("la base tiene una casilla decidida para cada rol y cada operación", async () => {
    const deLaBase = await leerMatrizDeLaBase();

    // 8 roles × 28 operaciones, todas con fila. Ninguna sin decidir.
    expect(deLaBase.size).toBe(28 * 8);
    // Ninguna quedó en nulo (la columna es NOT NULL, pero se comprueba lo obvio).
    for (const [casilla, permitido] of deLaBase) {
      expect(typeof permitido, `La casilla ${casilla} no tiene valor`).toBe("boolean");
    }
  });

  it("la base dice exactamente lo mismo que el documento, casilla por casilla", async () => {
    const delDocumento = leerMatrizDelDocumento();
    const deLaBase = await leerMatrizDeLaBase();

    const discrepancias = [];
    for (const [casilla, enElDocumento] of delDocumento) {
      const enLaBase = deLaBase.get(casilla);
      if (enLaBase !== enElDocumento) {
        const [rol, permiso] = casilla.split("|");
        discrepancias.push(
          `  ${rol} / ${permiso}: el documento dice ${enElDocumento ? "SÍ" : "no"} ` +
            `y la base dice ${enLaBase ? "SÍ" : "no"}`,
        );
      }
    }

    expect(
      discrepancias,
      `El documento y la base no coinciden en ${discrepancias.length} casilla(s):\n` +
        `${discrepancias.join("\n")}\n` +
        "  El documento (docs/reglas-de-negocio.md, sección 4.5) es la versión oficial: " +
        "hay que corregir la base con una migración nueva.",
    ).toEqual([]);
  });

  it("son 92 casillas marcadas", async () => {
    const deLaBase = await leerMatrizDeLaBase();

    const marcadas = [...deLaBase.values()].filter(Boolean).length;

    // Este número es la suma de lo aprobado. Si cambia, es que alguien movió la
    // matriz: o se corrigió a propósito (y hay que actualizar esta línea) o se
    // coló un cambio sin querer.
    expect(marcadas).toBe(92);
  });

  it("el dueño puede las 28 operaciones y el gerente 27", async () => {
    const deLaBase = await leerMatrizDeLaBase();

    const delDueno = [...deLaBase.entries()].filter(
      ([casilla, si]) => casilla.startsWith("dueno|") && si,
    );
    expect(delDueno, "El dueño debería tener las 28").toHaveLength(28);

    const delGerente = [...deLaBase.entries()].filter(
      ([casilla, si]) => casilla.startsWith("gerente|") && si,
    );
    expect(delGerente, "El gerente debería tener las 27").toHaveLength(27);
  });

  it("ningún rol se quedó sin ninguna operación", async () => {
    const deLaBase = await leerMatrizDeLaBase();

    for (const rol of ROLES) {
      const suyas = [...deLaBase.entries()].filter(
        ([casilla, si]) => casilla.startsWith(`${rol.codigo}|`) && si,
      );
      expect(suyas.length, `El rol ${rol.codigo} no tiene ninguna operación`).toBeGreaterThan(0);
    }
  });

  it("cada operación le sirve al menos a un rol", async () => {
    const deLaBase = await leerMatrizDeLaBase();
    const permisos = await conBaseDePrueba(({ sql }) =>
      sql("SELECT codigo FROM permiso ORDER BY codigo"),
    );

    for (const { codigo } of permisos) {
      const quienPuede = [...deLaBase.entries()].filter(
        ([casilla, si]) => casilla.endsWith(`|${codigo}`) && si,
      );
      expect(quienPuede.length, `Nadie puede "${codigo}"`).toBeGreaterThan(0);
    }
  });

  it("el mesero tiene sus 6 operaciones y ninguna de administración", async () => {
    const deLaBase = await leerMatrizDeLaBase();

    const delMesero = [...deLaBase.entries()]
      .filter(([casilla, si]) => casilla.startsWith("mesero|") && si)
      .map(([casilla]) => casilla.split("|")[1])
      .sort();

    expect(delMesero).toEqual([
      "ASIGNAR_MESA",
      "CAPTURAR_PEDIDO",
      "MARCAR_ENTREGA",
      "REGISTRAR_PROPINA",
      "VER_DISPONIBILIDAD",
      "VER_MESAS",
    ]);
  });

  it("la cocina no puede cobrar ni tocar el inventario, solo reportar y ver", async () => {
    const deLaBase = await leerMatrizDeLaBase();

    expect(deLaBase.get("cocina|CONFIRMAR_PREPARACION")).toBe(true);
    expect(deLaBase.get("cocina|REPORTAR_AGOTADO")).toBe(true);
    expect(deLaBase.get("cocina|VER_EXISTENCIAS")).toBe(true);
    expect(deLaBase.get("cocina|MOVER_INVENTARIO")).toBe(false);
    expect(deLaBase.get("cocina|REGISTRAR_PAGO")).toBe(false);
    expect(deLaBase.get("cocina|EMITIR_COMPROBANTE")).toBe(false);
  });

  it("el cajero cobra y emite, pero no regala consumo", async () => {
    const deLaBase = await leerMatrizDeLaBase();

    expect(deLaBase.get("cajero|REGISTRAR_PAGO")).toBe(true);
    expect(deLaBase.get("cajero|EMITIR_COMPROBANTE")).toBe(true);
    expect(deLaBase.get("cajero|APLICAR_CORTESIA")).toBe(false);
    expect(deLaBase.get("cajero|APLICAR_DESCUENTO")).toBe(true);
  });
});
