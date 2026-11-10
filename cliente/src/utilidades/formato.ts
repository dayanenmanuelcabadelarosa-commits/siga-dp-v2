/*
  formato.ts — cómo se escriben los números en la pantalla.
  --------------------------------------------------------
  El dinero se muestra en pesos dominicanos con dos decimales. La API manda un
  número (no una cadena), así que aquí solo se formatea; no se calcula nada.
*/

export function formatearDinero(monto: number): string {
  if (!Number.isFinite(monto)) return "RD$ 0.00";

  const texto = monto.toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `RD$ ${texto}`;
}

/**
 * Una cantidad de inventario: hasta dos decimales, sin ceros de relleno.
 * 5 → "5", 2.5 → "2.5", 2.05 → "2.05".
 */
export function formatearCantidad(cantidad: number): string {
  if (!Number.isFinite(cantidad)) return "0";

  return cantidad.toLocaleString("es-DO", {
    maximumFractionDigits: 2,
  });
}

/** Una cantidad con su signo delante, para el historial de movimientos. */
export function formatearCantidadConSigno(cantidad: number): string {
  if (!Number.isFinite(cantidad)) return "0";

  const texto = formatearCantidad(Math.abs(cantidad));
  if (cantidad > 0) return `+${texto}`;
  if (cantidad < 0) return `-${texto}`;
  return "0";
}
