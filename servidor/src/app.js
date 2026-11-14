/*
  app.js — la aplicación de Express.
  ----------------------------------

  Aquí se arma el servidor: las protecciones generales y las rutas.

  Lo que queda puesto desde el primer día, porque el plan (sección 7) dice que
  las correcciones de la auditoría se incorporan desde el inicio:

    · helmet                  → cabeceras de seguridad
    · límite de JSON (100 kb) → un cuerpo gigante se rechaza con 413
    · límite de peticiones    → un programa automático no tumba el servidor
    · una sola forma de responder, para éxito y para error
    · un manejador global de errores que no filtra información interna
    · asyncHandler            → ninguna promesa rechazada deja la petición colgada

  El formato de respuesta está confirmado en docs/reglas-de-negocio.md
  (sección 4):

    Éxito → { "ok": true,  "datos": ... }
    Error → { "ok": false, "error": { "codigo": "...", "mensaje": "..." } }

  Regla de oro 1 (nada se simula): ninguna ruta de este archivo inventa datos.
  GET /api/salud solo dice si el proceso está vivo.
*/

import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import { ErrorDeApi } from "./errores.js";
import { crearLimites } from "./limites.js";
import { rutasDeLaApi } from "./rutas/index.js";

// Se reexportan para no romper a quien ya los importaba desde aquí.
export { asyncHandler, ErrorDeApi } from "./errores.js";

/* --------------------------------------------------------- la aplicación */

/**
 * Arma la aplicación.
 *
 * @param {object} [opciones]
 * @param {object} [opciones.limites]  Permite ajustar los frenos de peticiones.
 *   Lo usan las pruebas para no tener que mandar 300 peticiones cuando quieren
 *   comprobar que el freno funciona.
 */
export function crearApp({ limites } = {}) {
  const app = express();

  // Detrás de un proxy (por ejemplo, al desplegar) hay que confiar en la
  // primera cabecera X-Forwarded-For para que el rate limiting vea la IP real.
  app.set("trust proxy", 1);

  app.use(helmet());

  // CORS para el cliente de Vite, configurable por entorno.
  const origenes = (process.env.ORIGENES || "http://localhost:5173")
    .split(",")
    .map((origen) => origen.trim())
    .filter(Boolean);
  app.use(cors({ origin: origenes }));

  // Límite de 100 kb: un cuerpo más grande no llega ni a las rutas.
  app.use(express.json({ limit: "100kb" }));

  const frenos = crearLimites(limites);

  /*
    Salud del proceso. A propósito NO dice nada interno: ni versión de la base,
    ni estado de las integraciones, ni la hora del servidor. Eso lo pedía la
    auditoría (punto 4.6).
  */
  app.get("/api/salud", (req, res) => {
    res.json({ ok: true, datos: { estado: "ok" } });
  });

  /*
    Frenos y rutas de negocio. El freno general va antes que las rutas de negocio.
    `/api/salud` queda a propósito por fuera del freno: un chequeo automático de
    que el sistema está vivo (cada pocos segundos) no puede quedar bloqueado por
    haber pasado el límite, porque entonces el chequeo avisaría de una caída que
    no existe.
  */
  app.use("/api", frenos.general);
  app.use("/api", rutasDeLaApi({ limites: frenos }));

  /*
  En produccion se sirve el cliente (SPA) desde la misma aplicacion. Si existe
  la carpeta de compilado del cliente, se entregan sus archivos estaticos y
  cualquier ruta que no sea de la API devuelve index.html (para que el router
  del cliente funcione al recargar una pagina).
*/
const carpetaCliente = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "cliente",
  "dist",
);

if (fs.existsSync(carpetaCliente)) {
  app.use(express.static(carpetaCliente));

  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(carpetaCliente, "index.html"));
  });
}

// La raíz no es de esta API: quien abra "/" es enviado a la aplicación web
// (el primer origen permitido en ORIGENES = la URL pública del frontend).
  app.get("/", (req, res) => {
    const destino = origenes[0];

    if (destino !== undefined && /^https?:\/\//i.test(destino)) {
      res.redirect(destino);
      return;
    }

    res.redirect("/api/salud");
  });

// Ruta que no existe.
  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: {
        codigo: "NO_ENCONTRADO",
        mensaje: `La ruta ${req.method} ${req.originalUrl} no existe.`,
      },
    });
  });

  /*
    Un solo lugar donde cualquier error se convierte en una respuesta.
    Si el error no se reconoce, se responde 500 con un mensaje genérico:
    el detalle se queda en el registro del servidor, no se enseña al usuario.
  */
  // eslint-disable-next-line no-unused-vars -- Express exige los cuatro argumentos
  app.use((error, req, res, next) => {
    let estado = 500;
    let codigo = "ERROR_INTERNO";
    let mensaje = "Ocurrió un error en el servidor.";

    if (error instanceof ErrorDeApi) {
      estado = error.estado;
      codigo = error.codigo;
      mensaje = error.message;
    } else if (error.type === "entity.too.large") {
      estado = 413;
      codigo = "CUERPO_DEMASIADO_GRANDE";
      mensaje = "El contenido enviado es demasiado grande.";
    } else if (error instanceof SyntaxError && "body" in error) {
      estado = 400;
      codigo = "JSON_INVALIDO";
      mensaje = "El contenido enviado no es un JSON válido.";
    }

    // El error real solo se escribe en el servidor.
    if (estado >= 500) console.error("[error]", error);

    res.status(estado).json({ ok: false, error: { codigo, mensaje } });
  });

  return app;
}

