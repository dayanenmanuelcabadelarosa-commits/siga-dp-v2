/*
  herramientas/preparar-certificado.js — deja el .p12 en el formato que la
  plataforma de facturación sabe leer.
  ---------------------------------------------------------------------------
  Uso:
    node herramientas/preparar-certificado.js <archivo.p12> <contraseña>

  Por qué:
    La plataforma usa node-forge, que solo entiende los .p12 viejos (3DES y
    SHA-1). Los .p12 que entrega la CCSD hoy vienen cifrados con PBES2/AES-256
    y node-forge los lee como si fueran basura: el error que sale es
    "Too few bytes to read ASN.1 value". Este script los reexporta en el
  formato clásico (misma clave, mismo certificado) y el archivo resultante ya
  lo puede subir la plataforma.

  Necesita openssl en el PATH (en Windows suele estar en
  "C:\Program Files\Git\mingw64\bin\openssl.exe").
*/

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [archivo, contrasena] = process.argv.slice(2);

if (!archivo || !contrasena) {
  console.error("Uso: node herramientas/preparar-certificado.js <archivo.p12> <contraseña>");
  process.exit(1);
}

if (!fs.existsSync(archivo)) {
  console.error(`No existe el archivo: ${archivo}`);
  process.exit(1);
}

/** El openssl de Windows si está donde Git lo deja; si no, el del PATH. */
function openssl() {
  const candidatos = [
    "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe",
    "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
  ];

  for (const candidato of candidatos) {
    if (fs.existsSync(candidato)) return candidato;
  }

  return "openssl";
}

const ejecutable = openssl();
const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "cert-"));
const extraido = path.join(temporal, "extraido.pem");
const destino = path.join(path.dirname(archivo), "certificado_clasico.p12");

function correr(args) {
  return execFileSync(ejecutable, args, { stdio: ["ignore", "pipe", "pipe"] });
}

try {
  correr(["pkcs12", "-in", archivo, "-passin", `pass:${contrasena}`, "-nodes", "-out", extraido]);
  correr([
    "pkcs12",
    "-export",
    "-in",
    extraido,
    "-out",
    destino,
    "-passout",
    `pass:${contrasena}`,
    "-certpbe",
    "PBE-SHA1-3DES",
    "-keypbe",
    "PBE-SHA1-3DES",
    "-macalg",
    "sha1",
  ]);

  // El "info" de openssl sale por stderr, no por stdout.
  const salidaInfo = execFileSync(
    ejecutable,
    ["pkcs12", "-in", destino, "-nokeys", "-passin", `pass:${contrasena}`, "-info"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const info = `${salidaInfo.stdout ?? ""}${salidaInfo.stderr ?? ""}`;

  const algoritmo =
    info.match(/Encrypted data: ([^\r\n]+)/)?.[1]?.trim() ??
    "3DES con SHA-1 (el formato que la plataforma sabe leer)";
  const sujeto = correr(["x509", "-in", extraido, "-noout", "-subject"]).toString().trim();

  console.log(`Listo: ${destino}`);
  console.log(`  Cifrado: ${algoritmo}`);
  console.log(`  ${sujeto}`);
  console.log("");
  console.log("Súbelo en la plataforma: Configuración > Certificados de la empresa.");
} catch (error) {
  const detalle = error.stderr?.toString() ?? error.message;
  console.error("No se pudo convertir el certificado:");
  console.error(detalle.split("\n").slice(0, 4).join("\n"));
  process.exit(1);
} finally {
  fs.rmSync(temporal, { recursive: true, force: true });
}
