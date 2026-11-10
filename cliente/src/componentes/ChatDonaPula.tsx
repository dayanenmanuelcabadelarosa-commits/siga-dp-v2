/*
  ChatDonaPula.tsx — el muñequito de Doña Pula en la esquina de todas las pantallas.
  -------------------------------------------------------------------------------

  Se toca el muñequito y se abre el chat. Se puede preguntar por el menú
  (productos, precios, disponibilidad) y, si el rol tiene permiso, por las
  ventas del día.

  El chat SOLO consulta: no cambia nada en el sistema. Y las ventas solo las ve
  quien tiene permiso: eso lo decide el servidor, no esta pantalla.
*/

import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { preguntarAAnaPula } from "../api/chat";
import { mensajeDeError } from "../api/errores";
import { Alerta } from "./Alerta";
import { Boton } from "./Boton";

interface Mensaje {
  quien: "yo" | "doña";
  texto: string;
  /** Si lo contestó el modelo o el sistema con los datos de la base. */
  origen?: "groq" | "base";
}

export function ChatDonaPula() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [preguntando, setPreguntando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finDeLaConversacion = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    finDeLaConversacion.current?.scrollIntoView?.({ block: "end" });
  }, [mensajes]);

  async function enviar() {
    const texto = pregunta.trim();

    if (texto === "" || preguntando) return;

    setPregunta("");
    setError(null);
    setMensajes((actuales) => [...actuales, { quien: "yo", texto }]);
    setPreguntando(true);

    try {
      const resultado = await preguntarAAnaPula(texto);
      setMensajes((actuales) => [
        ...actuales,
        { quien: "doña", texto: resultado.respuesta, origen: resultado.origen },
      ]);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setPreguntando(false);
    }
  }

  return (
    <>
      {/* El muñequito, siempre en la esquina. */}
      <button
        type="button"
        onClick={() => {
          setAbierto((actual) => !actual);
        }}
        aria-label={abierto ? "Cerrar el chat de Doña Pula" : "Abrir el chat de Doña Pula"}
        aria-expanded={abierto}
        className="fixed bottom-4 right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full border-2 border-miel bg-white shadow-lg transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brasa"
      >
        <img
          src="/imagenes/dona-pula.png"
          alt="Doña Pula"
          className="h-12 w-12 object-contain"
        />
      </button>

      {abierto && (
        <section
          aria-label="Chat de Doña Pula"
          className="fixed bottom-24 right-4 z-40 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-madera/10 bg-white shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b border-madera/10 bg-carbon px-4 py-3 text-crema">
            <MessageCircle size={18} aria-hidden="true" />
            <p className="flex-1 text-sm font-semibold">Doña Pula</p>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
              }}
              aria-label="Cerrar el chat"
              className="rounded-lg p-1 hover:bg-white/10"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {mensajes.length === 0 && (
              <p className="text-sm text-madera">
                Pregúntame por el menú: qué hay, cuánto cuesta y si está
                disponible.
              </p>
            )}

            {mensajes.map((mensaje, indice) => (
              <div key={`${mensaje.quien}-${indice}`}>
                <p
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                    mensaje.quien === "yo"
                      ? "ml-auto bg-brasa text-white"
                      : "bg-crema text-carbon"
                  }`}
                >
                  {mensaje.texto}
                </p>

                {mensaje.origen === "base" && (
                  <p className="mt-1 text-xs text-madera/70">
                    Contestado con los datos de la base: el asistente está
                    ocupado ahora mismo.
                  </p>
                )}
              </div>
            ))}

            {preguntando && (
              <p className="max-w-[90%] rounded-2xl bg-crema px-3 py-2 text-sm text-carbon">
                Doña Pula está pensando…
              </p>
            )}

            {error !== null && <Alerta tipo="error">{error}</Alerta>}

            <div ref={finDeLaConversacion} />
          </div>

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              void enviar();
            }}
            className="flex items-center gap-2 border-t border-madera/10 px-3 py-2"
          >
            <input
              type="text"
              value={pregunta}
              onChange={(evento) => setPregunta(evento.target.value)}
              placeholder="Escribe tu pregunta…"
              aria-label="Pregunta para Doña Pula"
              className="flex-1 rounded-xl border border-madera/20 px-3 py-2 text-sm"
              disabled={preguntando}
            />
            <Boton
              tipo="submit"
              cargando={preguntando}
              textoDeCarga="Enviando…"
              aria-label="Enviar la pregunta"
              icono={<Send size={16} aria-hidden="true" />}
              disabled={pregunta.trim() === ""}
            >
              Enviar
            </Boton>
          </form>
        </section>
      )}
    </>
  );
}
