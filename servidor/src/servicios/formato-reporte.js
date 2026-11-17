/*
  formato-reporte.js — cómo se ve el dinero en los reportes/PDF del asistente.
  Mismo formato que el cliente: es-DO con dos decimales y prefijo RD$.
*/

export function formatearDinero(monto) {
  if (!Number.isFinite(Number(monto))) return "RD$ 0.00";

  const texto = Number(monto).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `RD$ ${texto}`;
}
