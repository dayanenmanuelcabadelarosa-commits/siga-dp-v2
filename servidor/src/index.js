/*
  index.js — arranca el servidor.
  ------------------------------

  Lo que hace al arrancar:

    1. Comprueba que la base de datos responda. Si no responde, avisa y se
       detiene: es mejor no arrancar que arrancar a medias y fallar despu�s en la
       primera venta del d�a.
    2. Levanta la API.

  Reglas de oro que se respetan aqu�:
    � Regla 7 — todo error se muestra, y el arranque falla con un mensaje claro.
    � Regla 10 — se informa con honestidad: el arranque dice en qu� puerto qued�.
*/

import "dotenv/config";

import { crearApp } from "./app.js";
import { cerrarConexion, revisarConexion } from "./db/conexion.js";

/*
  Cloud Run entrega el puerto en la variable PORT (por defecto 8080). En local se
  sigue usando PUERTO, tal como est� documentado en el .env. Se aceptan las dos
  para que el mismo contenedor funcione en los dos entornos.
*/
const puerto = Number(process.env.PORT || process.env.PUERTO || 4000);
const app = crearApp();

try {
  const momento = await revisarConexion();
  console.info(`[api] base de datos conectada (hora del servidor: ${momento.toISOString()})`);
} catch (error) {
  console.error("[api] AVISO: no se pudo conectar con la base de datos al arrancar.");
  console.error(`[api] detalle: ${error.message}`);
  console.error("[api] El servidor arrancar� igual, pero las rutas que necesiten BD fallar�n.");
  console.error("[api] Revisa BD_HOST, BD_PUERTO, BD_USUARIO, BD_CLAVE, BD_NOMBRE en el entorno.");
}

const servidor = app.listen(puerto, () => {
  console.info(`[api] SIGA-DP v2 escuchando en http://localhost:${puerto}`);
  console.info(`[api] salud: http://localhost:${puerto}/api/salud`);
});

/*
  Apagado ordenado: al cerrar (Ctrl+C, o al terminar un despliegue) se deja de
  aceptar peticiones nuevas, se cierra el grupo de conexiones y se termina.
*/
let apagando = false;

async function apagar(senal) {
  if (apagando) return; // una segunda se�al no interrumpe el cierre
  apagando = true;

  console.info(`[api] recibida se�al ${senal}: cerrando�`);

  servidor.close(async () => {
    try {
      await cerrarConexion();
    } catch (error) {
      console.error(`[api] no se pudo cerrar limpiamente la base de datos: ${error.message}`);
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => apagar("SIGINT"));
process.on("SIGTERM", () => apagar("SIGTERM"));