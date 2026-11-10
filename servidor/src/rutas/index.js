/*
  index.js (rutas) — todas las rutas de la API en un solo lugar.
  -------------------------------------------------------------

  Cada módulo tiene su archivo. Aquí se montan bajo su dirección:

      /api/acceso      entrar, salir, yo
      /api/personal    empleados y cuentas de acceso
      /api/productos   productos, categorías y estaciones
      /api/mesas       zonas, mesas y reservas
      /api/inventario  insumos, proveedores y movimientos
      /api/propinas    propinas y cierre del día
      /api/cuentas     cuentas abiertas y su detalle
      /api/parametros  los parámetros fiscales
      /api/asistente   sugerencias del asistente de IA
      /api/paypal      cobros con PayPal
      /api/integraciones  diagnóstico de las APIs externas

  A partir de la Fase 4 se van sumando los módulos de gestión (personal,
  catálogo, salón, inventario...).
*/

import express from "express";

import { rutasDeAcceso } from "./acceso.js";
import { rutasDeAsistente } from "./asistente.js";
import { rutasDeBitacora } from "./bitacora.js";
import { rutasDeCocina } from "./cocina.js";
import { rutasDeComprobantes } from "./comprobantes.js";
import { rutasDeCorte } from "./corte.js";
import { rutasDeCuentas } from "./cuentas.js";
import { rutasDeInventario } from "./inventario.js";
import { rutasDeIntegraciones } from "./integraciones.js";
import { rutasDeMesas } from "./mesas.js";
import { rutasDeOfertas } from "./ofertas.js";
import { rutasDeParametros } from "./parametros.js";
import { rutasDePaypal } from "./paypal.js";
import { rutasDePedidos } from "./pedidos.js";
import { rutasDePersonal } from "./personal.js";
import { rutasDeProductos } from "./productos.js";
import { rutasDeReportes } from "./reportes.js";
import { rutasDePropinas } from "./propinas.js";
import { rutasDeWebhooks } from "./webhooks.js";

/**
 * @param {object} opciones
 * @param {object} opciones.limites  Los frenos de limites.js (general e ingresos).
 */
export function rutasDeLaApi({ limites }) {
  const api = express.Router();

  api.use("/acceso", rutasDeAcceso({ limiteIngresos: limites.ingresos }));
  api.use("/personal", rutasDePersonal());
  api.use("/productos", rutasDeProductos());
  api.use("/mesas", rutasDeMesas());
  api.use("/inventario", rutasDeInventario());
  api.use("/pedidos", rutasDePedidos());
  api.use("/cocina", rutasDeCocina());
  api.use("/propinas", rutasDePropinas());
  api.use("/cuentas", rutasDeCuentas());
  api.use("/ofertas", rutasDeOfertas());
  api.use("/comprobantes", rutasDeComprobantes());
  api.use("/corte", rutasDeCorte());
  api.use("/bitacora", rutasDeBitacora());
  api.use("/reportes", rutasDeReportes());
  api.use("/asistente", rutasDeAsistente());
  api.use("/paypal", rutasDePaypal());
  api.use("/integraciones", rutasDeIntegraciones());
  api.use("/webhooks", rutasDeWebhooks());
  api.use("/parametros", rutasDeParametros());

  return api;
}
