/*
  PantallaLogin.tsx — entrar al sistema.
  -------------------------------------

  La misma entrada del prototipo: a la izquierda la marca y la mascota; a la
  derecha el formulario. En celular se queda solo el formulario, para no quitarle
  espacio a lo que la persona vino a hacer.

  Todo lo que se ve aquí sale de la API: la clave se comprueba en PostgreSQL y
  el token lo firma el servidor. No hay ningún usuario ni clave escritos en el
  cliente.

  Tres cuidados que se notan en el uso:

    · Mientras se comprueba, el botón se deshabilita y dice "Entrando…". Si
      alguien pulsa dos veces, no se mandan dos intentos (que además contarían
      para el bloqueo de la cuenta).
    · Si la sesión anterior venció, se avisa aquí, antes de que la persona
      escriba nada.
    · Los errores del servidor se muestran tal cual: "Usuario o clave
      incorrectos. Te quedan 2 intentos…" es más útil que un "error" seco.
*/

import { Eye, EyeOff, Flame, LogIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { mensajeDeError } from "../api/errores";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { Logo } from "../componentes/Logo";
import { useSesion } from "../sesion/useSesion";

/**
 * A dónde volver después de entrar: a la pantalla que la persona quería abrir.
 * Solo se aceptan rutas de este sitio (que empiecen por `/` y no por `//`).
 */
function destinoDespuesDeEntrar(estado: unknown): string | null {
  if (typeof estado !== "object" || estado === null) return null;

  const posible = (estado as { desde?: unknown }).desde;

  if (
    typeof posible === "string" &&
    posible.startsWith("/") &&
    !posible.startsWith("//")
  ) {
    return posible;
  }

  return null;
}

function pantallaDeTrabajo(usuario: { rol?: string | null } | null): string {
  const rol = (usuario?.rol ?? "").toLowerCase();

  if (rol === "cocina") return "/cocina";
  if (rol === "cajero") return "/cuentas";
  if (rol === "mesero" || rol === "capitan" || rol === "anfitrion") {
    return "/mesas";
  }

  return "/";
}

export function PantallaLogin() {
  const {
    estado,
    usuario: usuarioSesion,
    entrar,
    aviso,
    descartarAviso,
  } = useSesion();
  const ubicacion = useLocation();

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [despertando, setDespertando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ayudaClave, setAyudaClave] = useState(false);
  const montadoRef = useRef(true);

  useEffect(() => {
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const destino =
    destinoDespuesDeEntrar(ubicacion.state) ??
    (estado === "autenticado"
      ? pantallaDeTrabajo(usuarioSesion)
      : "/");

  if (estado === "cargando") {
    return <Cargando pantallaCompleta texto="Comprobando tu sesión…" />;
  }

  // Ya hay alguien dentro: no tiene sentido enseñarle el formulario.
  if (estado === "autenticado") {
    return <Navigate to={destino} replace />;
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();

    descartarAviso();
    setAyudaClave(false);

    if (usuario.trim() === "" || clave === "") {
      setError("Escribe tu usuario y tu clave.");
      return;
    }

    setError(null);
    setEnviando(true);

    const esFalloDeConexion = (fallo: unknown): boolean =>
      typeof fallo === "object" &&
      fallo !== null &&
      "codigo" in fallo &&
      ((fallo as { codigo?: string }).codigo === "SIN_CONEXION" ||
        (fallo as { codigo?: string }).codigo === "TIEMPO_AGOTADO");

    try {
      try {
        await entrar(usuario.trim(), clave);
      } catch (primerFallo) {
        // El servidor despierta desde 0 instancias: la primera petición puede
        // perderse aunque el servidor termine respondiendo. Un segundo
        // intento, avisando, cubre justo ese caso. Entrar es idempotente.
        if (!esFalloDeConexion(primerFallo)) throw primerFallo;

        setDespertando(true);
        setError("El servidor está despertando, dame unos segundos…");
        await new Promise((listo) => {
          window.setTimeout(listo, 6_000);
        });

        if (!montadoRef.current) return;
        await entrar(usuario.trim(), clave);
      }
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
      setDespertando(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-crema lg:grid-cols-2">
      {/* --------------------------------------------------- panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-carbon p-10 text-crema lg:flex">
        {/* Resplandor de brasa y miel en el fondo */}
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brasa/30 blur-3xl" />
        <div className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-miel/15 blur-3xl" />

        <div className="relative flex items-center gap-2 text-miel">
          <Flame size={20} aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-widest">
            A pura leña
          </span>
        </div>

        <img
          src="/imagenes/dona-pula.png"
          alt="Doña Pula, la mascota del asadero"
          className="relative mx-auto max-h-[420px] object-contain drop-shadow-2xl"
        />

        <div className="relative">
          <h2 className="text-3xl font-semibold leading-tight">
            El sabor de la leña,
            <br />
            <span className="text-brasa">ahora bien organizado.</span>
          </h2>
          <p className="mt-3 max-w-sm text-sm text-crema/60">
            Sistema Integrado de Gestión y Atención del Asadero Doña Pula ·
            Santiago, R.D.
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------- el form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo tamano={110} />
            <h1 className="mt-4 text-2xl font-semibold">Asadero Doña Pula</h1>
            <p className="text-sm text-madera">Inicia sesión para continuar</p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(evento) => {
              void manejarEnvio(evento);
            }}
            noValidate
          >
            <Campo
              etiqueta="Usuario"
              name="usuario"
              autoComplete="username"
              autoFocus
              placeholder="ej: lfernandez"
              value={usuario}
              onChange={(evento) => {
                setUsuario(evento.target.value);
              }}
              disabled={enviando}
            />

            <Campo
              etiqueta="Clave"
              name="clave"
              type={verClave ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={clave}
              onChange={(evento) => {
                setClave(evento.target.value);
              }}
              disabled={enviando}
              adorno={
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-madera hover:bg-crema"
                  onClick={() => {
                    setVerClave((visible) => !visible);
                  }}
                  aria-label={verClave ? "Ocultar la clave" : "Mostrar la clave"}
                  aria-pressed={verClave}
                >
                  {verClave ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              }
            />

            {error !== null ? (
              <Alerta tipo="error">{error}</Alerta>
            ) : aviso !== null ? (
              <Alerta tipo="aviso">{aviso}</Alerta>
            ) : ayudaClave ? (
              <Alerta tipo="info">
                Pídele al administrador que te restablezca la clave.
              </Alerta>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAyudaClave(true);
                }}
                className="text-sm font-medium text-brasa hover:underline"
              >
                ¿Olvidaste la clave?
              </button>
            </div>

            <Boton
              tipo="submit"
              anchoCompleto
              cargando={enviando}
              textoDeCarga={despertando ? "Despertando el servidor…" : "Entrando…"}
              icono={<LogIn size={18} aria-hidden="true" />}
            >
              Iniciar sesión
            </Boton>
          </form>
        </div>
      </div>
    </div>
  );
}
