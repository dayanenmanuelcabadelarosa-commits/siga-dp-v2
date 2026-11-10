/*
  api-de-propinas.ts — un servidor de mentira para la pantalla de Propinas.
  -----------------------------------------------------------------------

  Guarda las mesas, las propinas y el cierre en memoria y aplica las mismas
  reglas que el servidor para lo que usa la pantalla: la mesa se elige, no se
  repite la propina y no se cierra dos veces al mismo empleado.

  No sustituye a las pruebas de integración: aquí se simula el cable, no la
  base. La transacción, los permisos y la fecha del negocio se prueban en el
  servidor contra PostgreSQL.
*/

import type {
  FilaDeCierre,
  MesaConPropina,
  PropinaDelDia,
  ResumenDeCierre,
  ResumenDePropinas,
} from "../../src/api/propinas";
import { respuestaDeError, respuestaDeExito } from "./api-falsa";

export interface PeticionDePropinas {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

export interface FalloDePropinas {
  metodo: string;
  /** La dirección termina con este texto. */
  sufijo: string;
  codigo: string;
  mensaje: string;
  estado?: number;
}

export interface EstadoDePropinas {
  fecha: string;
  mesas: MesaConPropina[];
  propinas: PropinaDelDia[];
  filas: FilaDeCierre[];
}

export interface ApiDePropinas {
  manejador: (url: string, inicio?: RequestInit) => Response;
  peticiones: PeticionDePropinas[];
  fallos: FalloDePropinas[];
  resumen: () => ResumenDePropinas;
  cierre: () => ResumenDeCierre;
}

function copia<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function cuerpoDe(
  inicio: RequestInit | undefined,
): Record<string, unknown> | null {
  if (typeof inicio?.body !== "string") return null;

  try {
    const leido: unknown = JSON.parse(inicio.body);
    return typeof leido === "object" && leido !== null
      ? (leido as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Un día con dos propinas ya registradas y una mesa libre para registrar. */
export function estadoDePropinasDePrueba(): EstadoDePropinas {
  return {
    fecha: "2026-10-19",
    mesas: [
      {
        idMesa: 1,
        numero: 1,
        zona: "Salón",
        idPedido: 10,
        propina: {
          id: 1,
          monto: 100,
          forma: "Efectivo",
          referencia: null,
          hora: "12:00",
        },
      },
      {
        idMesa: 2,
        numero: 2,
        zona: "Terraza",
        idPedido: 11,
        propina: {
          id: 2,
          monto: 250,
          forma: "Tarjeta",
          referencia: "AUTH-1",
          hora: "12:30",
        },
      },
      {
        idMesa: 3,
        numero: 3,
        zona: "Barra",
        idPedido: 12,
        propina: null,
      },
    ],
    propinas: [
      {
        id: 1,
        mesa: 1,
        zona: "Salón",
        monto: 100,
        forma: "Efectivo",
        referencia: null,
        hora: "12:00",
      },
      {
        id: 2,
        mesa: 2,
        zona: "Terraza",
        monto: 250,
        forma: "Tarjeta",
        referencia: "AUTH-1",
        hora: "12:30",
      },
    ],
    filas: [
      {
        idEmpleado: 7,
        empleado: "Luis Gómez",
        esperado: 100,
        cierre: null,
      },
      {
        idEmpleado: 8,
        empleado: "Ana Pérez",
        esperado: 250,
        cierre: null,
      },
    ],
  };
}

export function apiDePropinas(inicial: EstadoDePropinas): ApiDePropinas {
  const estado = copia(inicial);
  const peticiones: PeticionDePropinas[] = [];
  const fallos: FalloDePropinas[] = [];

  function resumen(): ResumenDePropinas {
    const total = estado.propinas.reduce(
      (suma, propina) => suma + propina.monto,
      0,
    );

    return {
      fecha: estado.fecha,
      mesas: copia(estado.mesas),
      propinas: copia(estado.propinas),
      total,
    };
  }

  function cierre(): ResumenDeCierre {
    const cerradas = estado.filas.filter((fila) => fila.cierre !== null);

    return {
      fecha: estado.fecha,
      filas: copia(estado.filas),
      totales: {
        totalEsperado: estado.filas.reduce(
          (suma, fila) => suma + fila.esperado,
          0,
        ),
        totalContado: cerradas.reduce(
          (suma, fila) => suma + (fila.cierre?.contado ?? 0),
          0,
        ),
        totalDiferencia: cerradas.reduce(
          (suma, fila) => suma + (fila.cierre?.diferencia ?? 0),
          0,
        ),
      },
    };
  }

  function registrar(cuerpo: Record<string, unknown> | null): Response {
    const numero = Number(cuerpo?.mesa);
    const mesa = estado.mesas.find((actual) => actual.numero === numero);

    if (mesa === undefined) {
      return respuestaDeError("NO_ENCONTRADO", "Esa mesa no existe.", 404);
    }

    if (mesa.propina !== null) {
      return respuestaDeError(
        "CONFLICTO_DE_ESTADO",
        "Ya registraste una propina para esa mesa hoy.",
        409,
      );
    }

    const forma = cuerpo?.forma;
    if (forma !== "Efectivo" && forma !== "Tarjeta") {
      return respuestaDeError(
        "DATOS_INVALIDOS",
        "Elige la forma de pago: efectivo o tarjeta.",
        400,
      );
    }

    const referencia =
      typeof cuerpo?.referencia === "string" ? cuerpo.referencia.trim() : "";

    if (forma === "Tarjeta" && referencia === "") {
      return respuestaDeError(
        "DATOS_INVALIDOS",
        "Escribe la referencia de la tarjeta.",
        400,
      );
    }

    const monto = Number(cuerpo?.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return respuestaDeError(
        "DATOS_INVALIDOS",
        "El monto debe ser mayor que cero.",
        400,
      );
    }

    const id = Math.max(0, ...estado.propinas.map((p) => p.id)) + 1;
    const propina: PropinaDelDia = {
      id,
      mesa: mesa.numero,
      zona: mesa.zona,
      monto,
      forma,
      referencia: forma === "Tarjeta" ? referencia : null,
      hora: "13:00",
    };

    estado.propinas.push(propina);
    mesa.propina = {
      id,
      monto,
      forma,
      referencia: propina.referencia,
      hora: propina.hora,
    };

    return respuestaDeExito(
      {
        propina: copia(propina),
        resumen: resumen(),
        mensaje: `Propina de la mesa ${mesa.numero} registrada.`,
      },
      201,
    );
  }

  function cerrar(cuerpo: Record<string, unknown> | null): Response {
    const idEmpleado = Number(cuerpo?.idEmpleado);
    const fila = estado.filas.find(
      (actual) => actual.idEmpleado === idEmpleado,
    );

    if (fila === undefined) {
      return respuestaDeError(
        "NO_ENCONTRADO",
        "Ese empleado no existe.",
        404,
      );
    }

    if (fila.cierre !== null) {
      return respuestaDeError(
        "CONFLICTO_DE_ESTADO",
        `Ya se cerraron las propinas de ${fila.empleado} hoy.`,
        409,
      );
    }

    const contado = Number(cuerpo?.contado);
    if (!Number.isFinite(contado) || contado < 0) {
      return respuestaDeError(
        "DATOS_INVALIDOS",
        "Escribe el monto contado.",
        400,
      );
    }

    fila.cierre = {
      id: idEmpleado,
      contado,
      diferencia: contado - fila.esperado,
      cerradoEn: "19/10/2026 18:00",
      cerradoPor: "Ana Pérez",
    };

    return respuestaDeExito(
      {
        cierre: {
          ...copia(fila.cierre),
          idEmpleado: fila.idEmpleado,
          empleado: fila.empleado,
          esperado: fila.esperado,
        },
        resumen: cierre(),
        mensaje: `Propinas de ${fila.empleado} cerradas.`,
      },
      201,
    );
  }

  function manejar(url: string, inicio?: RequestInit): Response {
    const metodo = inicio?.method ?? "GET";
    const cuerpo = cuerpoDe(inicio);
    peticiones.push({ url, metodo, cuerpo });

    const fallo = fallos.find(
      (candidato) =>
        candidato.metodo === metodo && url.endsWith(candidato.sufijo),
    );

    if (fallo !== undefined) {
      return respuestaDeError(
        fallo.codigo,
        fallo.mensaje,
        fallo.estado ?? 400,
      );
    }

    if (metodo === "GET" && url.endsWith("/api/propinas/cierre")) {
      return respuestaDeExito(cierre());
    }

    if (metodo === "GET" && url.endsWith("/api/propinas")) {
      return respuestaDeExito(resumen());
    }

    if (metodo === "POST" && url.endsWith("/api/propinas/cierre")) {
      return cerrar(cuerpo);
    }

    if (metodo === "POST" && url.endsWith("/api/propinas")) {
      return registrar(cuerpo);
    }

    return respuestaDeError(
      "NO_ENCONTRADO",
      "Esa dirección no existe en propinas.",
      404,
    );
  }

  return {
    manejador: manejar,
    peticiones,
    fallos,
    resumen,
    cierre,
  };
}
