/*
  formato.test.ts — cantidades de inventario sin ceros de relleno.
  ----------------------------------------------------------------
  El historial necesita que una salida se lea "-2.5" y una entrada "+3", no
  "-2.50" ni "3.00". La cantidad nunca se guarda como texto en la base: esto es
  solo la forma de mostrarla.
*/

import { describe, expect, it } from "vitest";

import {
  formatearCantidad,
  formatearCantidadConSigno,
} from "../../src/utilidades/formato";

describe("formatearCantidad", () => {
  it("quita los ceros de relleno y conserva hasta dos decimales", () => {
    expect(formatearCantidad(5)).toBe("5");
    expect(formatearCantidad(2.5)).toBe("2.5");
    expect(formatearCantidad(2.05)).toBe("2.05");
  });

  it("no inventa un número cuando el valor no es finito", () => {
    expect(formatearCantidad(Number.NaN)).toBe("0");
  });
});

describe("formatearCantidadConSigno", () => {
  it("pone el signo delante sin duplicar el menos", () => {
    expect(formatearCantidadConSigno(3)).toBe("+3");
    expect(formatearCantidadConSigno(-2.5)).toBe("-2.5");
    expect(formatearCantidadConSigno(0)).toBe("0");
  });
});
