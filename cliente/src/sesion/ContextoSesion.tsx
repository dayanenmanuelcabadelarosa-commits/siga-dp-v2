/*
  ContextoSesion.tsx — quién está dentro, y qué puede hacer.
  ---------------------------------------------------------

  Este proveedor es el único que sabe si hay una sesión abierta. Lo demás
  (pantallas, menú, guardas de ruta) le pregunta a él. Así no hay dos verdades:
  no existe una lista local de usuarios ni de permisos.

  De dónde sale cada dato:

    · El token y su vencimiento: de la respuesta de entrar.
    · El nombre, el rol y los permisos: de `GET /api/acceso/yo`, que los lee de
      PostgreSQL en ese momento. Por eso, si al empleado le cambian el rol o lo
      dan de baja, al recargar la página se entera; y si lo dan de baja con la
      página abierta, la siguiente petición devuelve 401 y aquí se cierra la
      sesión.

  Al recargar la página no se pregunta "¿quién era?" a un dato guardado: se
  pregunta al servidor con el token. Si el token ya no sirve, se borra y se pide
  entrar de nuevo.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import * as acceso from "../api/acceso";
import { cuandoExpireLaSesion, despertarServidor } from "../api/cliente-http";
import type { UsuarioDeSesion } from "../api/tipos";
import {
  guardarSesion,
  leerSesionCruda,
  limpiarSesion,
  sesionVencida,
} from "./almacen";
import { ContextoSesion } from "./contexto";
import type { EstadoDeSesion, SesionContexto } from "./contexto";

const AVISO_DE_SESION_VENCIDA =
  "Tu sesión venció. Vuelve a entrar para seguir trabajando.";

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDeSesion>("cargando");
  const [usuario, setUsuario] = useState<UsuarioDeSesion | null>(null);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [expiraEn, setExpiraEn] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /*
    `montado` evita que una respuesta lenta llegue después de que el proveedor
    ya se fue (por ejemplo, al recargar en medio de una petición) y escriba
    estado sobre un componente que ya no existe.
  */
  const montado = useRef(true);

  /**
   * Deja el estado como "no hay nadie". Se usa desde tres sitios: al salir, al
   * vencer la sesión y cuando el servidor dice que el token ya no sirve.
   */
  const quedarAnonimo = useCallback((mensaje: string | null) => {
    limpiarSesion();
    if (!montado.current) return;

    setUsuario(null);
    setPermisos([]);
    setExpiraEn(null);
    setEstado("anonimo");
    if (mensaje !== null) setAviso(mensaje);
  }, []);

  /* ------------------------------------------------ aviso de sesión vencida */

  useEffect(() => {
    /*
      El cliente HTTP avisa aquí cuando una petición con token recibe 401
      SIN_SESION. Es el enganche que hace que la expiración se maneje en un solo
      lugar y no en cada pantalla.
    */
    return cuandoExpireLaSesion(() => {
      quedarAnonimo(AVISO_DE_SESION_VENCIDA);
    });
  }, [quedarAnonimo]);

  /* --------------------------------------------------- sesión al abrir la app */

  useEffect(() => {
    montado.current = true;
    // El servidor corre con 0 instancias: lo despertamos ya, para que el
    // arranque en frío coincida con el tiempo en que la persona escribe.
    despertarServidor();

    const cruda = leerSesionCruda();

    if (cruda === null) {
      setEstado("anonimo");
      return;
    }

    if (sesionVencida(cruda)) {
      // Había una sesión, pero se le acabó el tiempo mientras la página estaba
      // cerrada. Se avisa, que es más útil que aparecer en el login sin decir nada.
      quedarAnonimo(AVISO_DE_SESION_VENCIDA);
      return;
    }

    let vigente = true;

    void acceso
      .yo()
      .then((datos) => {
        if (!vigente || !montado.current) return;

        // El servidor manda la hora de vencimiento del token; se guarda por si
        // cambió (por ejemplo, porque el token se renovó en el servidor).
        guardarSesion({ token: cruda.token, expiraEn: datos.expira_en });
        setUsuario(datos.usuario);
        setPermisos(datos.permisos);
        setExpiraEn(datos.expira_en);
        setEstado("autenticado");
      })
      .catch(() => {
        if (!vigente || !montado.current) return;

        // El token no sirve. No se muestra el detalle técnico: lo que importa
        // es que hay que volver a entrar.
        quedarAnonimo(null);
      });

    return () => {
      vigente = false;
    };
  }, [quedarAnonimo]);

  useEffect(() => {
    return () => {
      montado.current = false;
    };
  }, []);

  /* --------------------------------------------------------------- entrar */

  const entrar = useCallback(async (nombreUsuario: string, clave: string) => {
    const ingreso = await acceso.entrar(nombreUsuario, clave);

    /*
      Se guarda el token antes de pedir los permisos porque `yo()` lo necesita.
      Si esa segunda llamada falla, se borra: no puede quedar medio dentro.
    */
    guardarSesion({ token: ingreso.token, expiraEn: ingreso.expira_en });

    try {
      const mi = await acceso.yo();

      if (!montado.current) return;

      setUsuario(mi.usuario);
      setPermisos(mi.permisos);
      setExpiraEn(mi.expira_en);
      setAviso(null);
      setEstado("autenticado");
    } catch (error) {
      limpiarSesion();
      setEstado("anonimo");
      throw error;
    }
  }, []);

  /* ---------------------------------------------------------------- salir */

  const salir = useCallback(async () => {
    /*
      Se avisa al servidor, pero no se espera a que conteste para cerrar aquí.
      Si la red falla justo al salir, la persona igual tiene que quedar fuera:
      lo que cierra la sesión es borrar el token del navegador.
    */
    try {
      await acceso.salir();
    } catch {
      // Sin ruido: salir no puede depender de que el servidor esté despierto.
    }

    quedarAnonimo(null);
  }, [quedarAnonimo]);

  /* --------------------------------------------------------------- puede */

  const puede = useCallback(
    (codigoPermiso: string) => permisos.includes(codigoPermiso),
    [permisos],
  );

  const descartarAviso = useCallback(() => {
    setAviso(null);
  }, []);

  const valor = useMemo<SesionContexto>(
    () => ({
      estado,
      usuario,
      permisos,
      expiraEn,
      aviso,
      entrar,
      salir,
      puede,
      descartarAviso,
    }),
    [estado, usuario, permisos, expiraEn, aviso, entrar, salir, puede, descartarAviso],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}
