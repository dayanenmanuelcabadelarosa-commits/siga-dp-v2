/*
  fecha.ts — fechas de calendario, sin horas ni zonas horarias.
  -----------------------------------------------------------

  Una fecha de reserva es un día del calendario, no un instante. Por eso se
  guarda y se manda como texto `AAAA-MM-DD`: si se convirtiera a `Date` y se
  serializara, el navegador podría correrla un día según su zona horaria.

  Para mostrarla se arma una fecha a medianoche UTC y se formatea en UTC. Así
  "2030-01-15" se lee siempre como el 15 de enero, aquí y en cualquier equipo.
*/

/** La fecha local de hoy, en el formato que espera `<input type="date">`. */
export function fechaDeHoy(ahora = new Date()): string {
  const anio = String(ahora.getFullYear()).padStart(4, "0");
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");

  return `${anio}-${mes}-${dia}`;
}

/** "2030-01-15" → "15 de enero de 2030". */
export function formatearFecha(fecha: string): string {
  const partes = fecha.split("-").map(Number);
  if (partes.length !== 3 || partes.some((parte) => !Number.isInteger(parte))) {
    return fecha;
  }

  const anio = partes[0];
  const mes = partes[1];
  const dia = partes[2];

  if (anio === undefined || mes === undefined || dia === undefined) {
    return fecha;
  }

  const valor = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    valor.getUTCFullYear() !== anio ||
    valor.getUTCMonth() !== mes - 1 ||
    valor.getUTCDate() !== dia
  ) {
    return fecha;
  }

  return new Intl.DateTimeFormat("es-DO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(valor);
}

/**
 * Un instante (por ejemplo `ocurrido_en`) en la hora local del equipo:
 * "19/10/2026, 4:35 p. m.".
 */
export function formatearFechaHora(instante: string): string {
  const fecha = new Date(instante);

  if (Number.isNaN(fecha.getTime())) return instante;

  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}
