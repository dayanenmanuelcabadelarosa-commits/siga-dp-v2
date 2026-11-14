#!/bin/sh
# =============================================================================
#  Punto de entrada de SIGA-DP v2 en Docker / Cloud Run
# =============================================================================
#
#  Qué hace, en orden:
#    1. Traduce PORT (lo que inyecta Cloud Run) al nombre que usa la app: PUERTO.
#    2. Comprueba que estén las variables obligatorias, sin imprimir sus valores.
#    3. Aplica las migraciones pendientes (idempotentes y con candado en la BD).
#    4. Arranca el servidor.
#
#  Lo que NO hace:
#    - No trae credenciales por defecto. Si falta una, falla con un mensaje
#      claro. Antes había claves escritas aquí; eso era un secreto publicado.
#    - No carga la semilla. Los datos de desarrollo no se meten solos en
#      producción: se cargan a mano una sola vez, con una clave fuerte.
# =============================================================================

set -eu

# Cloud Run entrega el puerto en PORT. La aplicación lee PUERTO.
if [ -n "${PORT:-}" ]; then
  export PUERTO="$PORT"
fi
: "${PUERTO:=8080}"
export PUERTO

# --- Variables obligatorias -------------------------------------------------
faltan=""
for variable in BD_HOST BD_USUARIO BD_NOMBRE BD_CLAVE CLAVE_SESION; do
  eval "valor=\${$variable:-}"
  if [ -z "$valor" ]; then
    faltan="$faltan $variable"
  fi
done

if [ -n "$faltan" ]; then
  echo "[entrypoint] ERROR: faltan variables de entorno:$faltan" >&2
  echo "[entrypoint] En Cloud Run se configuran con --set-env-vars y --set-secrets." >&2
  exit 1
fi

if [ "${#CLAVE_SESION}" -lt 32 ]; then
  echo "[entrypoint] ERROR: CLAVE_SESION debe tener al menos 32 caracteres." >&2
  exit 1
fi

# --- Migraciones ------------------------------------------------------------
# OMITIR_MIGRACIONES=true existe solo para una emergencia operativa. En el
# despliegue normal se deja sin definir, para que el esquema siempre esté al día.
if [ "${OMITIR_MIGRACIONES:-false}" != "true" ]; then
  echo "[entrypoint] aplicando migraciones pendientes..."
  if ! node servidor/herramientas/migrar.js; then
    echo "[entrypoint] ERROR: no se pudieron aplicar las migraciones." >&2
    echo "[entrypoint] No se arranca a medias: revisa la base y vuelve a intentarlo." >&2
    exit 1
  fi
else
  echo "[entrypoint] AVISO: migraciones omitidas por OMITIR_MIGRACIONES=true." >&2
fi

echo "[entrypoint] arrancando SIGA-DP v2 en el puerto ${PUERTO}..."
exec node servidor/src/index.js