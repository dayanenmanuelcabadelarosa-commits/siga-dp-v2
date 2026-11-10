/*
  comprobantes.js (rutas) — comprobantes fiscales (Fase 6, módulo 5 y Fase 8).
  -----------------------------------------------------------------------------

  Endpoints:
    POST /api/comprobantes/:ncf/anular   anula un comprobante emitido
    GET  /api/comprobantes/:id/estado    cómo va en la plataforma
    GET  /api/comprobantes/:id/track     estado del timbre en la DGII
    GET  /api/comprobantes/:id/xml       el XML firmado

  Permiso: EMITIR_COMPROBANTE (dueño, gerente y cajero). La anulación es una
  acción delicada y se registra quién y cuándo la hizo (RN-09, RN-08).

  El número fiscal no se reutiliza: la secuencia sigue avanzando. Desde la
  Fase 8 el número lo asigna la plataforma de la DGII y se guarda tal cual.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { consultar, consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  consultarEstado,
  consultarTrack,
  descargarXml,
} from "../servicios/imecf.js";
import { esquemaHistorialComprobantes } from "../validaciones/comprobantes.js";
import { validar } from "../validaciones/validar.js";

/** Busca el comprobante y su id en la plataforma. */
async function comprobanteDeLaPlataforma(id) {
  const idNumero = Number(id);

  if (!Number.isInteger(idNumero) || idNumero <= 0) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "El identificador del comprobante no es válido.",
    );
  }

  const comprobante = await consultarUno(
    `SELECT id_comprobante, numero_ncf, id_ecf, estado, estado_ecf, dgii_url
       FROM comprobante
      WHERE id_comprobante = $1`,
    [idNumero],
  );

  if (!comprobante) {
    throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese comprobante no existe.");
  }

  if (!comprobante.id_ecf) {
    throw new ErrorDeApi(
      409,
      "CONFLICTO_DE_ESTADO",
      "Ese comprobante no se emitió por la plataforma de facturación.",
    );
  }

  return comprobante;
}

export function rutasDeComprobantes() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  rutas.get(
    "/historial",
    requierePermiso("EMITIR_COMPROBANTE"),
    validar(esquemaHistorialComprobantes, "consulta"),
    asyncHandler(async (req, res) => {
      const { desde, hasta, estado, busqueda } = req.datos;
      const comprobantes = await consultar(
        `SELECT cb.id_comprobante AS id,
                cb.numero_ncf AS ncf,
                cb.tipo,
                cb.cliente,
                cb.rnc_cliente AS "rncCliente",
                cb.base::FLOAT8 AS base,
                cb.impuesto::FLOAT8 AS impuesto,
                cb.total::FLOAT8 AS total,
                cb.forma_pago AS "formaPago",
                cb.estado,
                cb.estado_ecf AS "estadoEcF",
                cb.emitido_en AS "emitidoEn",
                cb.anulado_en AS "anuladoEn",
                cb.id_ecf AS "idEcF",
                cb.track_id AS "trackId",
                cb.dgii_url AS "dgiiUrl",
                cb.id_pago AS "pagoId",
                pg.comensal,
                c.numero AS "numeroCuenta",
                m.numero AS mesa,
                e.nombre AS emisor
           FROM comprobante cb
           LEFT JOIN cuenta c ON c.id_cuenta = cb.id_cuenta
           LEFT JOIN mesa m ON m.id_mesa = c.id_mesa
           LEFT JOIN pago pg ON pg.id_pago = cb.id_pago
           JOIN empleado e ON e.id_empleado = cb.id_emitido_por
          WHERE ($1::DATE IS NULL OR cb.emitido_en::DATE >= $1::DATE)
            AND ($2::DATE IS NULL OR cb.emitido_en::DATE <= $2::DATE)
            AND ($3::estado_comprobante IS NULL OR cb.estado = $3::estado_comprobante)
            AND ($4::TEXT IS NULL OR
                 cb.numero_ncf ILIKE '%' || $4 || '%' OR
                 cb.cliente ILIKE '%' || $4 || '%' OR
                 COALESCE(c.numero, '') ILIKE '%' || $4 || '%')
          ORDER BY cb.emitido_en DESC, cb.id_comprobante DESC
          LIMIT 500`,
        [desde ?? null, hasta ?? null, estado ?? null, busqueda || null],
      );

      exito(res, comprobantes);
    }),
  );

  // GET /api/comprobantes/:id/estado
  rutas.get(
    "/:id/estado",
    requierePermiso("EMITIR_COMPROBANTE"),
    asyncHandler(async (req, res) => {
      const comprobante = await comprobanteDeLaPlataforma(req.params.id);

      const estado = await consultarEstado(comprobante.id_ecf);

      const texto = JSON.stringify(estado).toLowerCase();
      const nuevoEstado = texto.includes("aceptad")
        ? "Aceptado"
        : texto.includes("observ")
          ? "Observado"
          : texto.includes("anulad")
            ? "Anulado"
            : texto.includes("rechaz")
              ? "Rechazado"
              : "Enviado";

      await consultar(
        "UPDATE comprobante SET estado_ecf = $1 WHERE id_comprobante = $2",
        [nuevoEstado, comprobante.id_comprobante],
      );

      exito(res, { ...estado, estadoEcF: nuevoEstado });
    }),
  );

  // GET /api/comprobantes/:id/track
  rutas.get(
    "/:id/track",
    requierePermiso("EMITIR_COMPROBANTE"),
    asyncHandler(async (req, res) => {
      const comprobante = await comprobanteDeLaPlataforma(req.params.id);
      const track = await consultarTrack(comprobante.id_ecf);
      exito(res, track);
    }),
  );

  // GET /api/comprobantes/:id/xml
  rutas.get(
    "/:id/xml",
    requierePermiso("EMITIR_COMPROBANTE"),
    asyncHandler(async (req, res) => {
      const comprobante = await comprobanteDeLaPlataforma(req.params.id);
      const xml = await descargarXml(comprobante.id_ecf);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.status(200).send(xml);
    }),
  );

  rutas.post(
    "/:ncf/anular",
    requierePermiso("EMITIR_COMPROBANTE"),
    asyncHandler(async (req, _res) => {
      const ncf = String(req.params.ncf || "").trim();

      if (ncf === "") {
        throw new ErrorDeApi(400, "DATOS_INVALIDOS", "El número de comprobante no es válido.");
      }

      const comprobante = await consultarUno(
        "SELECT id_ecf, estado FROM comprobante WHERE numero_ncf = $1",
        [ncf],
      );

      if (!comprobante) {
        throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese comprobante no existe.");
      }

      throw new ErrorDeApi(
        501,
        "ANULACION_FISCAL_NO_DISPONIBLE",
        "La plataforma fiscal no ofrece una operación de anulación configurada. El comprobante no se modificó; anúlalo en el portal fiscal y conserva la constancia.",
      );
    }),
  );

  return rutas;
}
