/*
  ContextoSesion.test.tsx — el proveedor de sesión, contra la API de mentira.
  -------------------------------------------------------------------------

  Lo que se comprueba aquí es la lógica que decide quién está dentro:

    · Al abrir la aplicación, si hay token, se le pregunta al servidor.
    · Si el token venció, no se gasta la petición y se avisa.
    · Entrar guarda el token y carga los permisos.
    · Si algo falla a medias, no queda "medio dentro".
    · Salir cierra aquí aunque el servidor no conteste.
    · Un 401 del servidor a mitad del trabajo cierra la sesión y avisa.
*/

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pedir } from "../../src/api/cliente-http";
import { ErrorDeApi } from "../../src/api/errores";
import { guardarSesion, leerSesion } from "../../src/sesion/almacen";
import { ProveedorSesion } from "../../src/sesion/ContextoSesion";
import { useSesion } from "../../src/sesion/useSesion";
import {
  URL_DE_PRUEBA,
  respuestaDeError,
  respuestaDeExito,
  simularFetch,
} from "../ayudas/api-falsa";
import { PERMISOS_DEL_MESERO, USUARIO_DE_PRUEBA } from "../ayudas/sesion-de-prueba";

const USUARIO_MESERO = {
  ...USUARIO_DE_PRUEBA,
  id_usuario: 2,
  usuario: "mesero",
  nombre: "Luis Gómez",
  rol: "mesero",
  rol_nombre: "Mesero",
  nivel: 2,
};

function enUnaHora(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function haceUnaHora(): string {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

function datosDeSesion(permisos: string[] = PERMISOS_DEL_MESERO) {
  return { usuario: USUARIO_MESERO, permisos, expira_en: enUnaHora() };
}

function envolver({ children }: { children: ReactNode }) {
  return <ProveedorSesion>{children}</ProveedorSesion>;
}

function montarSesion() {
  return renderHook(() => useSesion(), { wrapper: envolver });
}

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", URL_DE_PRUEBA);
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("ProveedorSesion", () => {
  it("sin nada guardado arranca anónimo y no llama al servidor", async () => {
    const falso = simularFetch(() => respuestaDeExito({}));

    const { result } = montarSesion();

    /*
      No se comprueba el estado "cargando": `renderHook` ejecuta los efectos
      dentro de `act`, así que para cuando se puede mirar el resultado ya se
      resolvió. El "comprobando tu sesión" se prueba en RutaProtegida.
    */
    await waitFor(() => {
      expect(result.current.estado).toBe("anonimo");
    });

    expect(result.current.usuario).toBeNull();
    expect(result.current.permisos).toEqual([]);
    expect(falso).not.toHaveBeenCalled();
  });

  it("con un token válido recupera quién es y sus permisos del servidor", async () => {
    guardarSesion({ token: "token-guardado", expiraEn: enUnaHora() });
    const falso = simularFetch(() => respuestaDeExito(datosDeSesion()));

    const { result } = montarSesion();

    await waitFor(() => {
      expect(result.current.estado).toBe("autenticado");
    });

    expect(result.current.usuario?.nombre).toBe("Luis Gómez");
    expect(result.current.usuario?.rol_nombre).toBe("Mesero");
    expect(result.current.permisos).toEqual(PERMISOS_DEL_MESERO);
    expect(result.current.puede("CAPTURAR_PEDIDO")).toBe(true);
    expect(result.current.puede("ADMINISTRAR_PERSONAL")).toBe(false);

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/acceso/yo`);
    expect(inicio?.headers).toMatchObject({ Authorization: "Bearer token-guardado" });
  });

  it("con el token vencido no llama al servidor, avisa y queda anónimo", async () => {
    guardarSesion({ token: "token-viejo", expiraEn: haceUnaHora() });
    const falso = simularFetch(() => respuestaDeExito({}));

    const { result } = montarSesion();

    await waitFor(() => {
      expect(result.current.estado).toBe("anonimo");
    });

    expect(result.current.aviso).toMatch(/sesión venció/i);
    expect(falso).not.toHaveBeenCalled();
    expect(leerSesion()).toBeNull();
  });

  it("entrar guarda el token y carga los permisos", async () => {
    simularFetch((url) => {
      if (url.endsWith("/api/acceso/entrar")) {
        return respuestaDeExito({
          token: "token-nuevo",
          expira_en: enUnaHora(),
          usuario: USUARIO_MESERO,
        });
      }

      if (url.endsWith("/api/acceso/yo")) {
        return respuestaDeExito(datosDeSesion());
      }

      return respuestaDeError("NO_ENCONTRADO", "Esa ruta no existe.", 404);
    });

    const { result } = montarSesion();
    await waitFor(() => {
      expect(result.current.estado).toBe("anonimo");
    });

    await act(async () => {
      await result.current.entrar("mesero", "clave-buena");
    });

    expect(result.current.estado).toBe("autenticado");
    expect(result.current.usuario?.usuario).toBe("mesero");
    expect(result.current.puede("CAPTURAR_PEDIDO")).toBe(true);
    expect(leerSesion()?.token).toBe("token-nuevo");
  });

  it("si falla la carga de permisos después de entrar, no queda medio dentro", async () => {
    simularFetch((url) => {
      if (url.endsWith("/api/acceso/entrar")) {
        return respuestaDeExito({
          token: "token-nuevo",
          expira_en: enUnaHora(),
          usuario: USUARIO_MESERO,
        });
      }

      return respuestaDeError("SIN_SESION", "Necesitas iniciar sesión.", 401);
    });

    const { result } = montarSesion();
    await waitFor(() => {
      expect(result.current.estado).toBe("anonimo");
    });

    let fallo: unknown = null;

    await act(async () => {
      try {
        await result.current.entrar("mesero", "clave-buena");
      } catch (error) {
        fallo = error;
      }
    });

    expect(fallo).toBeInstanceOf(ErrorDeApi);
    expect(result.current.estado).toBe("anonimo");
    expect(result.current.usuario).toBeNull();
    expect(leerSesion()).toBeNull();
  });

  it("salir cierra la sesión aunque el servidor falle", async () => {
    guardarSesion({ token: "token-guardado", expiraEn: enUnaHora() });
    simularFetch(() => respuestaDeExito(datosDeSesion()));

    const { result } = montarSesion();
    await waitFor(() => {
      expect(result.current.estado).toBe("autenticado");
    });

    // Ahora la red se cae justo al salir.
    simularFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    await act(async () => {
      await result.current.salir();
    });

    expect(result.current.estado).toBe("anonimo");
    expect(result.current.usuario).toBeNull();
    expect(leerSesion()).toBeNull();
  });

  it("cuando una petición recibe 401 SIN_SESION, cierra la sesión y avisa", async () => {
    guardarSesion({ token: "token-guardado", expiraEn: enUnaHora() });
    simularFetch(() => respuestaDeExito(datosDeSesion()));

    const { result } = montarSesion();
    await waitFor(() => {
      expect(result.current.estado).toBe("autenticado");
    });

    // A mitad del trabajo, el servidor dice que la sesión ya no sirve.
    simularFetch(() => respuestaDeError("SIN_SESION", "Necesitas iniciar sesión.", 401));

    await act(async () => {
      await pedir("/api/algo").catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.estado).toBe("anonimo");
    });

    expect(result.current.aviso).toMatch(/sesión venció/i);
    expect(leerSesion()).toBeNull();
  });
});
