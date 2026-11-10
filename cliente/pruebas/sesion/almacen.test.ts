/*
  almacen.test.ts — el token guardado, y lo que pasa cuando llega basura.
*/

import { beforeEach, describe, expect, it } from "vitest";

import {
  guardarSesion,
  leerSesion,
  leerSesionCruda,
  limpiarSesion,
  sesionVencida,
} from "../../src/sesion/almacen";

const CLAVE = "siga-dp.sesion";

function enUnaHora(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function haceUnaHora(): string {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("almacén de la sesión", () => {
  it("guarda y vuelve a leer la sesión", () => {
    guardarSesion({ token: "abc", expiraEn: enUnaHora() });

    expect(leerSesion()).toMatchObject({ token: "abc" });
  });

  it("al limpiar, no queda nada", () => {
    guardarSesion({ token: "abc", expiraEn: enUnaHora() });

    limpiarSesion();

    expect(leerSesion()).toBeNull();
  });

  it("una sesión vencida no se lee como sesión, pero se puede ver que estaba", () => {
    guardarSesion({ token: "abc", expiraEn: haceUnaHora() });

    expect(leerSesion()).toBeNull();
    expect(leerSesionCruda()).toMatchObject({ token: "abc" });
  });

  it("distingue vencida de vigente", () => {
    expect(sesionVencida({ token: "abc", expiraEn: haceUnaHora() })).toBe(true);
    expect(sesionVencida({ token: "abc", expiraEn: enUnaHora() })).toBe(false);
  });

  it("descarta una sesión sin token", () => {
    window.sessionStorage.setItem(
      CLAVE,
      JSON.stringify({ token: "", expiraEn: enUnaHora() }),
    );

    expect(leerSesionCruda()).toBeNull();
  });

  it("descarta una fecha que no se puede entender", () => {
    window.sessionStorage.setItem(
      CLAVE,
      JSON.stringify({ token: "abc", expiraEn: "mañana por la tarde" }),
    );

    expect(leerSesionCruda()).toBeNull();
  });

  it("descarta un JSON roto, sin romperse", () => {
    window.sessionStorage.setItem(CLAVE, "{esto no es json");

    expect(leerSesionCruda()).toBeNull();
  });

  it("descarta algo que no es un objeto", () => {
    window.sessionStorage.setItem(CLAVE, JSON.stringify("solo un texto"));

    expect(leerSesionCruda()).toBeNull();
  });
});
