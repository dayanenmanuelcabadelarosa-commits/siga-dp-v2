/*
  herramientas/verificar-claves.js — revisa las claves de las integraciones.
  ---------------------------------------------------------------------------
  Uso:
    npm run claves:verificar

  Qué hace:
    Llama a cada servicio de verdad (sin cobrar ni enviar nada) y dice si la
  clave funciona. Es lo que hay que correr después de pegar una clave nueva en
  servidor/.env, para saber si quedó bien puesta.

  No imprime ninguna clave: solo dice si cada una sirve o qué le falta.
*/

import "dotenv/config";

import { leerConfigAsistente, hayClave } from "../src/servicios/asistente.js";
import {
  leerConfigImecf,
  hayClave as hayClaveDeImecf,
  listarDocumentos,
} from "../src/servicios/imecf.js";
import {
  leerConfigPaypal,
  hayCredenciales,
  listarWebhooks,
} from "../src/servicios/paypal.js";

const verde = "OK  ";
const rojo = "FALLA";
const avisos = [];

console.log("\n  Revisión de las claves de las integraciones");
console.log("  ────────────────────────────────────────────\n");

/* ------------------------------------------------------------------ Groq */
{
  const config = leerConfigAsistente();

  if (!hayClave(config)) {
    console.log(`  ${rojo}  Groq (chat y sugerencias): falta GROQ_API_KEY en servidor/.env`);
    avisos.push("Groq: falta la clave");
  } else {
    try {
      const { completarConGroq } = await import("../src/servicios/groq.js");
      await completarConGroq([{ role: "user", content: "di ok" }], {
        config,
        maxTokens: 512,
        timeoutMs: 30_000,
      });

      console.log(`  ${verde}  Groq: el modelo ${config.modelo} responde.`);
    } catch (error) {
      console.log(`  ${rojo}  Groq: ${error.message}`);
      avisos.push("Groq: la clave no responde");
    }
  }
}

/* ---------------------------------------------------------------- PayPal */
{
  const config = leerConfigPaypal();

  if (!hayCredenciales(config)) {
    console.log(
      `  ${rojo}  PayPal: faltan PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en servidor/.env`,
    );
    avisos.push("PayPal: faltan las credenciales");
  } else {
    try {
      const webhooks = await listarWebhooks(config);
      const propio = webhooks.find((webhook) => webhook.id === config.webhookId);

      console.log(`  ${verde}  PayPal: las credenciales sirven (${config.entorno}).`);

      if (webhooks.length === 0) {
        console.log(
          "        Ojo: no hay ningun webhook registrado. El pago se captura desde la",
        );
        console.log(
          "        pantalla del cajero, pero si el cliente paga con la ventana",
        );
        console.log("        cerrada no llegara el aviso.");
        avisos.push("PayPal: falta registrar el webhook");
      } else if (config.webhookId === "" || propio === undefined) {
        console.log(
          "        Ojo: el webhook de esta maquina no esta registrado (PAYPAL_WEBHOOK_ID).",
        );
        avisos.push("PayPal: el PAYPAL_WEBHOOK_ID no coincide con ningun webhook");
      } else {
        console.log("        El webhook de esta maquina esta registrado.");
      }
    } catch (error) {
      console.log(`  ${rojo}  PayPal: ${error.message}`);
      avisos.push("PayPal: las credenciales no sirven");
    }
  }
}

/* ---------------------------------------------------- Facturación (IMECF) */
{
  const config = leerConfigImecf();

  if (!hayClaveDeImecf(config)) {
    console.log(
      `  ${rojo}  Facturación electrónica: falta IMECF_API_KEY en servidor/.env`,
    );
    avisos.push("IMECF: falta la clave");
  } else {
    try {
      const documentos = await listarDocumentos({ config });
      const ultimo = documentos[0];

      console.log(
        `  ${verde}  Facturación electrónica: la clave sirve (${documentos.length} documentos vistos).`,
      );

      if (ultimo !== undefined && ultimo.errorMessage) {
        console.log(
          `        Ojo: el ultimo comprobante (${ultimo.encf}) quedo en estado ${ultimo.estado}: ${ultimo.errorMessage}`,
        );
        console.log(
          "        Si es 'ERROR AL ENVIAR A DGII', la clave esta bien y lo que falla",
        );
        console.log("        es el certificado de la empresa ante la DGII.");
        avisos.push("IMECF: el ultimo comprobante fue rechazado por la DGII");
      }
    } catch (error) {
      console.log(`  ${rojo}  Facturación electrónica: ${error.message}`);
      avisos.push("IMECF: la clave no sirve");
    }
  }
}

console.log("");

if (avisos.length === 0) {
  console.log("  Todo listo.\n");
  process.exit(0);
}

console.log("  Pendientes:");
for (const aviso of avisos) {
  console.log(`   · ${aviso}`);
}
console.log("");
process.exit(1);
