/*
  ofertas.js (rutas) — descuentos y ofertas (Fase 8).
  ------------------------------------------------------

  Endpoints:
    GET  /api/ofertas                 lista de ofertas
    POST /api/ofertas                 crea una oferta
    PATCH /api/ofertas/:id            edita una oferta
    POST /api/ofertas/:id/activar    activa una oferta
    POST /api/ofertas/:id/desactivar  desactiva una oferta

  Permiso: ADMINISTRAR_PROMOCIONES (dueño y gerente). Son las ofertas del
  negocio: las define la gerencia y las usa el cajero al cobrar.

  Aquí NO interviene la IA: una oferta es un dato guardado en PostgreSQL.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar, consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  esquemaCrearOferta,
  esquemaEditarOferta,
} from "../validaciones/ofertas.js";
import { validar } from "../validaciones/validar.js";

const CAMPOS_DE_OFERTA = `
  p.id_promocion AS id,
  p.nombre,
  p.descripcion,
  p.tipo_valor AS "tipoValor",
  p.valor::FLOAT8 AS valor,
  p.activo,
  p.fecha_inicio AS "fechaInicio",
  p.fecha_fin AS "fechaFin"
`;

function idDeLaRuta(req) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "El identificador de la oferta no es válido.",
    );
  }

  return id;
}

export function rutasDeOfertas() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  // GET /api/ofertas
  rutas.get(
    "/",
    requierePermiso("ADMINISTRAR_PROMOCIONES"),
    asyncHandler(async (req, res) => {
      const soloActivas = req.query.activo === "true";
      const hoy = await consultarUno(
        "SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS fecha",
      );

      const ofertas = await consultar(
        `SELECT ${CAMPOS_DE_OFERTA}
           FROM promocion p
          WHERE ($1::boolean = FALSE OR p.activo)
            AND (p.fecha_inicio IS NULL OR p.fecha_inicio <= $2::date)
            AND (p.fecha_fin IS NULL OR p.fecha_fin >= $2::date)
          ORDER BY p.activo DESC, p.nombre`,
        [soloActivas, hoy.fecha],
      );

      exito(res, ofertas);
    }),
  );

  // GET /api/ofertas/activas
  /*
    Las ofertas que el cajero puede aplicar al cobrar. Es una ruta aparte porque
    el cajero no administra ofertas: solo necesita ver las que están activas.
  */
  rutas.get(
    "/activas",
    requierePermiso("REGISTRAR_PAGO"),
    asyncHandler(async (_req, res) => {
      const hoy = await consultarUno(
        "SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS fecha",
      );

      const ofertas = await consultar(
        `SELECT ${CAMPOS_DE_OFERTA}
           FROM promocion p
          WHERE p.activo
            AND (p.fecha_inicio IS NULL OR p.fecha_inicio <= $1::date)
            AND (p.fecha_fin IS NULL OR p.fecha_fin >= $1::date)
          ORDER BY p.nombre`,
        [hoy.fecha],
      );

      exito(res, ofertas);
    }),
  );

  // POST /api/ofertas
  rutas.post(
    "/",
    requierePermiso("ADMINISTRAR_PROMOCIONES"),
    validar(esquemaCrearOferta),
    asyncHandler(async (req, res) => {
      const {
        nombre,
        descripcion,
        tipoValor,
        valor,
        fechaInicio,
        fechaFin,
      } = req.datos;

      let creada;

      try {
        creada = await conTransaccion(
          async ({ consultarUno: uno }) => {
            const repetida = await uno(
              "SELECT id_promocion FROM promocion WHERE nombre = $1",
              [nombre],
            );

            if (repetida) {
              throw new ErrorDeApi(
                409,
                "YA_EXISTE",
                "Ya hay una oferta con ese nombre.",
              );
            }

            const fila = await uno(
              `INSERT INTO promocion (nombre, descripcion, tipo_valor, valor, fecha_inicio, fecha_fin, activo)
               VALUES ($1, $2, $3, $4, $5, $6, TRUE)
               RETURNING id_promocion`,
              [
                nombre,
                descripcion ?? "",
                tipoValor,
                valor,
                fechaInicio,
                fechaFin,
              ],
            );

            return uno(
              `SELECT ${CAMPOS_DE_OFERTA} FROM promocion p WHERE p.id_promocion = $1`,
              [fila.id_promocion],
            );
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        if (error.code === "23505") {
          throw new ErrorDeApi(
            409,
            "YA_EXISTE",
            "Ya hay una oferta con ese nombre.",
          );
        }
        throw error;
      }

      exito(res, creada, 201);
    }),
  );

  // PATCH /api/ofertas/:id
  rutas.patch(
    "/:id",
    requierePermiso("ADMINISTRAR_PROMOCIONES"),
    validar(esquemaEditarOferta),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req);
      const cambios = req.datos;

      let actualizada;

      try {
        actualizada = await conTransaccion(
          async ({ consultarUno: uno }) => {
            const actual = await uno(
              "SELECT * FROM promocion WHERE id_promocion = $1 FOR UPDATE",
              [id],
            );

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa oferta no existe.",
              );
            }

            await uno(
              `UPDATE promocion
                  SET nombre = $1,
                      descripcion = $2,
                      tipo_valor = $3,
                      valor = $4,
                      fecha_inicio = $5,
                      fecha_fin = $6
                WHERE id_promocion = $7`,
              [
                cambios.nombre ?? actual.nombre,
                cambios.descripcion ?? actual.descripcion,
                cambios.tipoValor ?? actual.tipo_valor,
                cambios.valor ?? actual.valor,
                cambios.fechaInicio ?? actual.fecha_inicio,
                cambios.fechaFin ?? actual.fecha_fin,
                id,
              ],
            );

            return uno(
              `SELECT ${CAMPOS_DE_OFERTA} FROM promocion p WHERE p.id_promocion = $1`,
              [id],
            );
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        if (error.code === "23505") {
          throw new ErrorDeApi(
            409,
            "YA_EXISTE",
            "Ya hay una oferta con ese nombre.",
          );
        }
        throw error;
      }

      exito(res, actualizada);
    }),
  );

  // POST /api/ofertas/:id/activar y /desactivar
  for (const [ruta, activo, mensaje] of [
    ["activar", true, "Oferta activada."],
    ["desactivar", false, "Oferta desactivada."],
  ]) {
    rutas.post(
      `/:id/${ruta}`,
      requierePermiso("ADMINISTRAR_PROMOCIONES"),
      asyncHandler(async (req, res) => {
        const id = idDeLaRuta(req);

        const actualizada = await conTransaccion(
          async ({ consultarUno: uno }) => {
            const fila = await uno(
              `UPDATE promocion
                  SET activo = $1
                WHERE id_promocion = $2
                RETURNING id_promocion`,
              [activo, id],
            );

            if (!fila) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa oferta no existe.",
              );
            }

            return uno(
              `SELECT ${CAMPOS_DE_OFERTA} FROM promocion p WHERE p.id_promocion = $1`,
              [id],
            );
          },
          { usuario: req.sesion.usuario },
        );

        exito(res, { ...actualizada, mensaje });
      }),
    );
  }

  return rutas;
}
