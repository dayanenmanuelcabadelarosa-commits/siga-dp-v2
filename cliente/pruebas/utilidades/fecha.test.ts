/*
  fecha.test.ts — las fechas de calendario no se corren de día.
  -------------------------------------------------------------

  Una reserva se guarda como `AAAA-MM-DD`, no como un instante. Estas pruebas
  fijan las dos mitades del trato: la fecha local de hoy se arma sin pasar por
  UTC, y al mostrarla se interpreta en UTC para que no cambie de día.
*/

import { describe, expect, it } from "vitest";

import { fechaDeHoy, formatearFecha, formatearFechaHora } from "../../src/utilidades/fecha";

describe("fechaDeHoy", () => {
  it("arma la fecha local con dos dígitos en mes y día", () => {
    expect(fechaDeHoy(new Date(2026, 0, 5, 23, 50))).toBe("2026-01-05");
  });
});

describe("formatearFecha", () => {
  it("lee la fecha como un día del calendario, sin corrimiento de zona", () => {
    expect(formatearFecha("2030-01-15")).toBe("15 de enero de 2030");
  });

  it("devuelve el texto tal cual si no es una fecha real", () => {
    expect(formatearFecha("2030-13-40")).toBe("2030-13-40");
    expect(formatearFecha("no es una fecha")).toBe("no es una fecha");
  });
});

describe("formatearFechaHora", () => {
  it("deja tal cual un instante que no se puede leer", () => {
    expect(formatearFechaHora("no es un instante")).toBe("no es un instante");
  });

  it("muestra el día y la hora de un instante real", () => {
    const texto = formatearFechaHora("2026-10-19T15:35:00.000Z");

    expect(texto).toContain("2026");
    expect(texto).toMatch(/\d{1,2}:\d{2}/);
  });
});
