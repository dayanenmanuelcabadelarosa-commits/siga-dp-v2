/*
  El esquema, tal como quedó.
  ---------------------------

  Estas pruebas no comprueban reglas de negocio: comprueban que el esquema esté
  completo y que nadie lo haya cambiado sin querer. Sirven de centinela.

  Si alguna falla, no es que una regla se rompió: es que la base ya no es la que
  el equipo cree que es. Hay que mirar antes de seguir.
*/

import { afterAll, describe, expect, it } from "vitest";

import { verificarClave } from "../src/acceso/claves.js";
import { cerrarPool, conBaseDePrueba } from "./ayudas/base-de-prueba.js";

afterAll(async () => {
  await cerrarPool();
});

describe("El esquema quedó completo", () => {
  it("hay 42 tablas de negocio", async () => {
    await conBaseDePrueba(async (ay) => {
      const cuantas = await ay.numero(
        `SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      );

      // 42 tablas del diseño (41 del profesor más "pago_paypal", que llegó en
      // la Fase 8) más la tabla "migracion", que lleva el control de qué
      // migraciones se aplicaron. En total 43.
      expect(cuantas).toBe(43);
    });
  });

  it("hay 9 vistas de consulta", async () => {
    await conBaseDePrueba(async (ay) => {
      const cuantas = await ay.numero(
        "SELECT count(*) FROM information_schema.views WHERE table_schema = 'public'",
      );

      expect(cuantas).toBe(9);
    });
  });

  it("están los 8 roles y las 28 operaciones", async () => {
    await conBaseDePrueba(async (ay) => {
      const roles = await ay.numero("SELECT count(*) FROM rol");
      const permisos = await ay.numero("SELECT count(*) FROM permiso");

      expect(roles).toBe(8);

      // La lista original traía 27. El dueño aprobó la 28 el 19 de octubre de
      // 2026 como REPORTAR_AGOTADO; la carga la migración 014.
      expect(permisos).toBe(28);
    });
  });

  it("la matriz de permisos está cargada con las 224 casillas", async () => {
    await conBaseDePrueba(async (ay) => {
      const cuantas = await ay.numero("SELECT count(*) FROM rol_permiso");
      const marcadas = await ay.numero("SELECT count(*) FROM rol_permiso WHERE permitido");

      // 8 roles × 28 operaciones: las 27 de la migración 011 y la 28 de la 014.
      // El contenido casilla por casilla lo vigila
      // matriz-de-permisos.integracion.test.js, que compara la base contra la tabla
      // del documento aprobado.
      expect(cuantas).toBe(8 * 28);
      expect(marcadas).toBe(92);
    });
  });

  it("cada migración aplicada tiene su huella y su fecha", async () => {
    await conBaseDePrueba(async (ay) => {
      const migraciones = await ay.sql("SELECT nombre, suma_sha256, aplicada_en FROM migracion ORDER BY nombre");

      expect(migraciones.length).toBeGreaterThanOrEqual(8);

      for (const migracion of migraciones) {
        expect(migracion.suma_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(migracion.aplicada_en).toBeInstanceOf(Date);
      }
    });
  });

  it("están las funciones de negocio", async () => {
    await conBaseDePrueba(async (ay) => {
      const esperadas = [
        "fn_abrir_pedido",
        "fn_generar_cuenta",
        "fn_total_cuenta",
        "fn_cobrar_cuenta",
        "fn_emitir_comprobante",
        "fn_anular_comprobante",
        "fn_cerrar_propinas",
        "fn_cerrar_corte",
      ];

      const filas = await ay.sql(
        `SELECT p.proname FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'`,
      );
      const existentes = new Set(filas.map((fila) => fila.proname));

      for (const funcion of esperadas) {
        expect(existentes.has(funcion), `Falta la función ${funcion}`).toBe(true);
      }
    });
  });

  it("los datos de desarrollo quedaron completos y utilizables", async () => {
    await conBaseDePrueba(async (ay) => {
      const resumen = await ay.uno(
        `SELECT
           (SELECT count(*) FROM parametro)      AS parametros,
           (SELECT count(*) FROM secuencia_ncf)  AS secuencias,
           (SELECT count(*) FROM zona)           AS zonas,
           (SELECT count(*) FROM mesa)           AS mesas,
           (SELECT count(*) FROM producto)       AS productos,
           (SELECT count(*) FROM usuario u JOIN empleado e ON e.id_empleado = u.id_empleado JOIN rol r ON r.id_rol = e.id_rol WHERE r.codigo = 'gerente') AS gerentes`,
      );

      expect(Number(resumen.parametros)).toBeGreaterThanOrEqual(1);
      expect(Number(resumen.secuencias)).toBe(2);
      expect(Number(resumen.zonas)).toBeGreaterThanOrEqual(1);
      expect(Number(resumen.mesas)).toBeGreaterThanOrEqual(1);
      expect(Number(resumen.productos)).toBe(2);
      expect(Number(resumen.gerentes)).toBe(1);
    });
  });

  it("la clave del gerente está cifrada, no en texto plano", async () => {
    await conBaseDePrueba(async (ay) => {
      const cuenta = await ay.uno("SELECT clave_hash FROM usuario WHERE usuario = 'gerente'");

      expect(cuenta.clave_hash).not.toBe("gerente");
      // El formato es "sal$hash", los dos en hexadecimal.
      expect(cuenta.clave_hash).toMatch(/^[a-f0-9]{32}\$[a-f0-9]{128}$/);
    });
  });

  it("la clave del gerente de la semilla sirve para entrar (y solo esa)", async () => {
    await conBaseDePrueba(async (ay) => {
      const cuenta = await ay.uno("SELECT clave_hash FROM usuario WHERE usuario = 'gerente'");

      // Esto es lo que hará la Fase 2 al iniciar sesión. Comprobarlo aquí cierra
      // el círculo: demuestra que el hash que guardó la herramienta de semilla y
      // el verificador de contraseñas hablan el mismo idioma.
      expect(verificarClave("gerente", cuenta.clave_hash)).toBe(true);
      expect(verificarClave("Gerente", cuenta.clave_hash)).toBe(false);
      expect(verificarClave("", cuenta.clave_hash)).toBe(false);
    });
  });
});
