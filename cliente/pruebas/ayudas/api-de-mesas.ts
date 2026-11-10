/*
  api-de-mesas.ts — un servidor de mentira que se acuerda del salón.
  ----------------------------------------------------------------
  Las pruebas de la pantalla necesitan que, después de ocupar una mesa, crear una
  reserva o abrirla, el siguiente GET devuelva el estado nuevo. Este ayudante
  guarda zonas, mesas y reservas en memoria y aplica las reglas que la pantalla
  usa (capacidad, choque de reservas, mesa ocupada, zona con mesas).

  No sustituye a las pruebas de integración: aquí se simula el cable, no la base.
  Las restricciones de PostgreSQL se prueban en el servidor.
*/

import type {
  DatosDeMesas,
  Mesa,
  Reserva,
  Zona,
} from "../../src/api/mesas";
import { respuestaDeError, respuestaDeExito } from "./api-falsa";

export interface PeticionDeMesas {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

export interface FalloDeMesas {
  metodo: string;
  /** La dirección termina con este texto. */
  sufijo: string;
  codigo: string;
  mensaje: string;
  estado?: number;
}

export interface ApiDeMesas {
  manejador: (url: string, inicio?: RequestInit) => Response;
  peticiones: PeticionDeMesas[];
  fallos: FalloDeMesas[];
  datos: () => DatosDeMesas;
  reservas: () => Reserva[];
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function numero(valor: unknown, porDefecto = 0): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? valor
    : porDefecto;
}

function cuerpoDe(inicio: RequestInit | undefined): Record<string, unknown> | null {
  return typeof inicio?.body === "string"
    ? (JSON.parse(inicio.body) as Record<string, unknown>)
    : null;
}

function rutaDe(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function fechaDe(url: string): string {
  try {
    return new URL(url).searchParams.get("fecha") ?? "";
  } catch {
    return "";
  }
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function idDeLaRuta(ruta: string, patron: RegExp): number {
  const encontrado = patron.exec(ruta);
  return encontrado === null ? 0 : Number(encontrado[1]);
}

function ahora(): string {
  return new Date().toISOString();
}

function hoy(): string {
  const fecha = new Date();
  const anio = String(fecha.getFullYear()).padStart(4, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export function apiDeMesas(
  iniciales: DatosDeMesas,
  reservasIniciales: Reserva[] = [],
): ApiDeMesas {
  let datos: DatosDeMesas = {
    zonas: iniciales.zonas.map((zona) => ({ ...zona })),
    mesas: iniciales.mesas.map((mesa) => ({ ...mesa })),
  };

  let reservas: Reserva[] = reservasIniciales.map((reserva) => ({
    ...reserva,
  }));

  const peticiones: PeticionDeMesas[] = [];
  const fallos: FalloDeMesas[] = [];

  function zonaDe(id: number): Zona | null {
    return datos.zonas.find((zona) => zona.id_zona === id) ?? null;
  }

  function mesaDe(id: number): Mesa | null {
    return datos.mesas.find((mesa) => mesa.id_mesa === id) ?? null;
  }

  function reservaDe(id: number): Reserva | null {
    return reservas.find((reserva) => reserva.id_reserva === id) ?? null;
  }

  function guardarMesa(actualizada: Mesa): Mesa {
    datos = {
      ...datos,
      mesas: datos.mesas.map((mesa) =>
        mesa.id_mesa === actualizada.id_mesa ? actualizada : mesa,
      ),
    };

    reservas = reservas.map((reserva) =>
      reserva.id_mesa === actualizada.id_mesa
        ? {
            ...reserva,
            mesa_numero: actualizada.numero,
            zona: actualizada.zona,
          }
        : reserva,
    );

    return actualizada;
  }

  function guardarReserva(actualizada: Reserva): Reserva {
    reservas = reservas.map((reserva) =>
      reserva.id_reserva === actualizada.id_reserva ? actualizada : reserva,
    );

    return actualizada;
  }

  function nombreDeZonaRepetido(nombre: string, idExcluir = 0): boolean {
    return datos.zonas.some(
      (zona) =>
        zona.id_zona !== idExcluir && normalizar(zona.nombre) === normalizar(nombre),
    );
  }

  function numeroDeMesaRepetido(numeroMesa: number, idExcluir = 0): boolean {
    return datos.mesas.some(
      (mesa) => mesa.id_mesa !== idExcluir && mesa.numero === numeroMesa,
    );
  }

  function choqueDeReserva(
    idMesa: number,
    fecha: string,
    hora: string,
    idExcluir = 0,
  ): boolean {
    return reservas.some(
      (reserva) =>
        reserva.id_reserva !== idExcluir &&
        reserva.id_mesa === idMesa &&
        reserva.fecha === fecha &&
        reserva.hora === hora &&
        reserva.estado !== "Cancelada",
    );
  }

  function manejador(url: string, inicio?: RequestInit): Response {
    const metodo = inicio?.method ?? "GET";
    const cuerpo = cuerpoDe(inicio);
    const ruta = rutaDe(url);

    peticiones.push({ url, metodo, cuerpo });

    const fallo = fallos.find(
      (posible) =>
        posible.metodo === metodo && url.endsWith(posible.sufijo),
    );

    if (fallo !== undefined) {
      return respuestaDeError(
        fallo.codigo,
        fallo.mensaje,
        fallo.estado ?? 409,
      );
    }

    if (ruta === "/api/mesas" && metodo === "GET") {
      return respuestaDeExito(datos);
    }

    if (ruta === "/api/mesas" && metodo === "POST") {
      const numeroMesa = numero(cuerpo?.numero);
      const idZona = numero(cuerpo?.id_zona);
      const capacidad = numero(cuerpo?.capacidad);
      const zona = zonaDe(idZona);

      if (zona === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa zona no existe.",
          400,
        );
      }

      if (!zona.activo) {
        return respuestaDeError(
          "ZONA_INACTIVA",
          "La zona está inactiva. Elige una activa.",
        );
      }

      if (numeroDeMesaRepetido(numeroMesa)) {
        return respuestaDeError(
          "NUMERO_DUPLICADO",
          `Ya existe la mesa ${numeroMesa}.`,
        );
      }

      const mesa: Mesa = {
        id_mesa: Math.max(0, ...datos.mesas.map((fila) => fila.id_mesa)) + 1,
        numero: numeroMesa,
        id_zona: zona.id_zona,
        zona: zona.nombre,
        tipo_ambiente: zona.tipo_ambiente,
        zona_activa: zona.activo,
        capacidad,
        estado: "libre",
        personas: null,
        hora_llegada: null,
        id_mesero_orden: null,
        mesero_orden: null,
        estado_pedido: null,
        creado_en: ahora(),
        modificado_en: ahora(),
      };

      datos = { ...datos, mesas: [...datos.mesas, mesa] };

      return respuestaDeExito(mesa, 201);
    }

    if (ruta === "/api/mesas/zonas" && metodo === "POST") {
      const nombre = texto(cuerpo?.nombre);

      if (nombreDeZonaRepetido(nombre)) {
        return respuestaDeError(
          "NOMBRE_DUPLICADO",
          "Ya hay una zona con ese nombre.",
        );
      }

      const zona: Zona = {
        id_zona: Math.max(0, ...datos.zonas.map((fila) => fila.id_zona)) + 1,
        nombre,
        tipo_ambiente: texto(cuerpo?.tipo_ambiente),
        activo: true,
      };

      datos = { ...datos, zonas: [...datos.zonas, zona] };

      return respuestaDeExito(zona, 201);
    }

    if (ruta.startsWith("/api/mesas/zonas/") && metodo === "PATCH") {
      const id = idDeLaRuta(ruta, /\/api\/mesas\/zonas\/(\d+)$/);
      const actual = zonaDe(id);

      if (actual === null) {
        return respuestaDeError("NO_ENCONTRADO", "Esa zona no existe.", 404);
      }

      const nombre =
        cuerpo?.nombre === undefined ? actual.nombre : texto(cuerpo.nombre);

      if (nombreDeZonaRepetido(nombre, id)) {
        return respuestaDeError(
          "NOMBRE_DUPLICADO",
          "Ya hay una zona con ese nombre.",
        );
      }

      const actualizada: Zona = {
        ...actual,
        nombre,
        tipo_ambiente:
          cuerpo?.tipo_ambiente === undefined
            ? actual.tipo_ambiente
            : texto(cuerpo.tipo_ambiente),
      };

      datos = {
        ...datos,
        zonas: datos.zonas.map((zona) =>
          zona.id_zona === id ? actualizada : zona,
        ),
        mesas: datos.mesas.map((mesa) =>
          mesa.id_zona === id
            ? {
                ...mesa,
                zona: actualizada.nombre,
                tipo_ambiente: actualizada.tipo_ambiente,
              }
            : mesa,
        ),
      };

      reservas = reservas.map((reserva) =>
        reserva.zona === actual.nombre
          ? { ...reserva, zona: actualizada.nombre }
          : reserva,
      );

      return respuestaDeExito(actualizada);
    }

    if (ruta.startsWith("/api/mesas/zonas/") && metodo === "DELETE") {
      const id = idDeLaRuta(ruta, /\/api\/mesas\/zonas\/(\d+)$/);
      const actual = zonaDe(id);

      if (actual === null) {
        return respuestaDeError("NO_ENCONTRADO", "Esa zona no existe.", 404);
      }

      const cantidadDeMesas = datos.mesas.filter(
        (mesa) => mesa.id_zona === id,
      ).length;

      if (cantidadDeMesas > 0) {
        return respuestaDeError(
          "ZONA_CON_MESAS",
          `La zona "${actual.nombre}" tiene ${cantidadDeMesas} ${
            cantidadDeMesas === 1 ? "mesa" : "mesas"
          }. Cámbialas de zona antes de eliminarla.`,
        );
      }

      datos = {
        ...datos,
        zonas: datos.zonas.filter((zona) => zona.id_zona !== id),
      };

      return respuestaDeExito({ id_zona: id });
    }

    if (
      /^\/api\/mesas\/\d+\/estado$/.test(ruta) &&
      metodo === "PATCH"
    ) {
      const id = idDeLaRuta(ruta, /\/api\/mesas\/(\d+)\/estado$/);
      const actual = mesaDe(id);

      if (actual === null) {
        return respuestaDeError("NO_ENCONTRADO", "Esa mesa no existe.", 404);
      }

      const estado = texto(cuerpo?.estado);

      if (estado === "ocupada") {
        if (actual.estado === "ocupada") {
          return respuestaDeError(
            "MESA_YA_OCUPADA",
            "Esa mesa ya está ocupada.",
          );
        }

        if (actual.estado === "limpieza") {
          return respuestaDeError(
            "MESA_EN_LIMPIEZA",
            "Esa mesa está en limpieza. Termínala antes de ocuparla.",
          );
        }

        const personas = numero(cuerpo?.personas);

        if (personas > actual.capacidad) {
          return respuestaDeError(
            "CAPACIDAD_EXCEDIDA",
            `La mesa ${actual.numero} tiene capacidad para ${actual.capacidad} personas.`,
          );
        }

        return respuestaDeExito(
          guardarMesa({
            ...actual,
            estado: "ocupada",
            personas,
            hora_llegada: ahora(),
            id_mesero_orden: null,
            estado_pedido: null,
            modificado_en: ahora(),
          }),
        );
      }

      if (estado === "limpieza") {
        if (actual.estado === "limpieza") {
          return respuestaDeError(
            "MESA_YA_EN_LIMPIEZA",
            "Esa mesa ya está en limpieza.",
          );
        }

        return respuestaDeExito(
          guardarMesa({
            ...actual,
            estado: "limpieza",
            personas: null,
            hora_llegada: null,
            id_mesero_orden: null,
            estado_pedido: null,
            modificado_en: ahora(),
          }),
        );
      }

      if (estado === "libre") {
        if (actual.estado === "libre") {
          return respuestaDeError(
            "MESA_YA_LIBRE",
            "Esa mesa ya está libre.",
          );
        }

        return respuestaDeExito(
          guardarMesa({
            ...actual,
            estado: "libre",
            personas: null,
            hora_llegada: null,
            id_mesero_orden: null,
            estado_pedido: null,
            modificado_en: ahora(),
          }),
        );
      }

      return respuestaDeError(
        "DATOS_INVALIDOS",
        "Ese estado de mesa no existe.",
        400,
      );
    }

    if (/^\/api\/mesas\/\d+$/.test(ruta) && metodo === "PATCH") {
      const id = idDeLaRuta(ruta, /\/api\/mesas\/(\d+)$/);
      const actual = mesaDe(id);

      if (actual === null) {
        return respuestaDeError("NO_ENCONTRADO", "Esa mesa no existe.", 404);
      }

      const numeroMesa =
        cuerpo?.numero === undefined ? actual.numero : numero(cuerpo.numero);
      const idZona =
        cuerpo?.id_zona === undefined ? actual.id_zona : numero(cuerpo.id_zona);
      const capacidad =
        cuerpo?.capacidad === undefined
          ? actual.capacidad
          : numero(cuerpo.capacidad);
      const zona = zonaDe(idZona);

      if (zona === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa zona no existe.",
          400,
        );
      }

      if (!zona.activo && idZona !== actual.id_zona) {
        return respuestaDeError(
          "ZONA_INACTIVA",
          "La zona está inactiva. Elige una activa.",
        );
      }

      if (numeroDeMesaRepetido(numeroMesa, id)) {
        return respuestaDeError(
          "NUMERO_DUPLICADO",
          `Ya existe la mesa ${numeroMesa}.`,
        );
      }

      if (capacidad < (actual.personas ?? 0)) {
        return respuestaDeError(
          "CAPACIDAD_MENOR_QUE_PERSONAS",
          `La mesa tiene ${actual.personas} ${
            actual.personas === 1 ? "persona" : "personas"
          } ahora mismo; no puedes bajar la capacidad por debajo de eso.`,
        );
      }

      if (
        capacidad < actual.capacidad &&
        reservas.some(
          (reserva) =>
            reserva.id_mesa === id &&
            reserva.estado !== "Cancelada" &&
            reserva.fecha >= hoy() &&
            reserva.personas > capacidad,
        )
      ) {
        return respuestaDeError(
          "CAPACIDAD_MENOR_QUE_RESERVAS",
          "Hay reservas de hoy o de más adelante con más personas que la nueva capacidad.",
        );
      }

      return respuestaDeExito(
        guardarMesa({
          ...actual,
          numero: numeroMesa,
          id_zona: zona.id_zona,
          zona: zona.nombre,
          tipo_ambiente: zona.tipo_ambiente,
          zona_activa: zona.activo,
          capacidad,
          modificado_en: ahora(),
        }),
      );
    }

    if (/^\/api\/mesas\/\d+$/.test(ruta) && metodo === "DELETE") {
      const id = idDeLaRuta(ruta, /\/api\/mesas\/(\d+)$/);
      const actual = mesaDe(id);

      if (actual === null) {
        return respuestaDeError("NO_ENCONTRADO", "Esa mesa no existe.", 404);
      }

      if (reservas.some((reserva) => reserva.id_mesa === id)) {
        return respuestaDeError(
          "MESA_CON_HISTORIAL",
          `La mesa ${actual.numero} tiene reservas o servicios registrados. No se puede eliminar.`,
        );
      }

      datos = {
        ...datos,
        mesas: datos.mesas.filter((mesa) => mesa.id_mesa !== id),
      };

      return respuestaDeExito({ id_mesa: id });
    }

    if (ruta === "/api/mesas/reservas" && metodo === "GET") {
      const fecha = fechaDe(url);

      return respuestaDeExito({
        fecha,
        reservas: reservas
          .filter((reserva) => reserva.fecha === fecha)
          .sort(
            (a, b) =>
              a.hora.localeCompare(b.hora) ||
              a.mesa_numero - b.mesa_numero ||
              a.nombre_cliente.localeCompare(b.nombre_cliente, "es"),
          ),
      });
    }

    if (ruta === "/api/mesas/reservas" && metodo === "POST") {
      const idMesa = numero(cuerpo?.id_mesa);
      const mesa = mesaDe(idMesa);
      const fecha = texto(cuerpo?.fecha);
      const hora = texto(cuerpo?.hora);
      const personas = numero(cuerpo?.personas);

      if (mesa === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa mesa no existe.",
          400,
        );
      }

      if (!mesa.zona_activa) {
        return respuestaDeError(
          "ZONA_INACTIVA",
          `La zona "${mesa.zona}" está inactiva. Elige una mesa de una zona activa.`,
        );
      }

      if (personas > mesa.capacidad) {
        return respuestaDeError(
          "CAPACIDAD_EXCEDIDA",
          `La mesa ${mesa.numero} tiene capacidad para ${mesa.capacidad} personas.`,
        );
      }

      if (choqueDeReserva(idMesa, fecha, hora)) {
        return respuestaDeError(
          "RESERVA_DUPLICADA",
          "Ya hay una reserva para esa mesa, esa fecha y esa hora.",
        );
      }

      const reserva: Reserva = {
        id_reserva:
          Math.max(0, ...reservas.map((fila) => fila.id_reserva)) + 1,
        fecha,
        hora,
        nombre_cliente: texto(cuerpo?.nombre_cliente),
        telefono: texto(cuerpo?.telefono),
        personas,
        id_mesa: mesa.id_mesa,
        mesa_numero: mesa.numero,
        zona: mesa.zona,
        estado: "Pendiente",
        motivo_cancelacion: null,
        id_mesero_asignado: null,
        creado_en: ahora(),
      };

      reservas = [...reservas, reserva];

      return respuestaDeExito(reserva, 201);
    }

    if (
      /^\/api\/mesas\/reservas\/\d+\/cancelar$/.test(ruta) &&
      metodo === "POST"
    ) {
      const id = idDeLaRuta(ruta, /\/api\/mesas\/reservas\/(\d+)\/cancelar$/);
      const actual = reservaDe(id);

      if (actual === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa reserva no existe.",
          404,
        );
      }

      if (actual.estado !== "Pendiente") {
        return respuestaDeError(
          "RESERVA_NO_CANCELABLE",
          `La reserva ya está ${actual.estado.toLowerCase()} y no se puede cancelar.`,
        );
      }

      return respuestaDeExito(
        guardarReserva({
          ...actual,
          estado: "Cancelada",
          motivo_cancelacion: texto(cuerpo?.motivo_cancelacion),
        }),
      );
    }

    if (
      /^\/api\/mesas\/reservas\/\d+\/abrir$/.test(ruta) &&
      metodo === "POST"
    ) {
      const id = idDeLaRuta(ruta, /\/api\/mesas\/reservas\/(\d+)\/abrir$/);
      const actual = reservaDe(id);

      if (actual === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa reserva no existe.",
          404,
        );
      }

      if (actual.estado !== "Pendiente") {
        return respuestaDeError(
          "RESERVA_NO_ABRIBLE",
          `La reserva ya está ${actual.estado.toLowerCase()} y no se puede abrir.`,
        );
      }

      const mesa = mesaDe(actual.id_mesa);

      if (mesa === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "La mesa de esa reserva ya no existe.",
          400,
        );
      }

      if (mesa.estado === "ocupada") {
        return respuestaDeError(
          "MESA_OCUPADA",
          "La mesa de esa reserva ya está ocupada.",
        );
      }

      if (mesa.estado === "limpieza") {
        return respuestaDeError(
          "MESA_EN_LIMPIEZA",
          "La mesa de esa reserva está en limpieza. Termínala antes de abrirla.",
        );
      }

      if (actual.personas > mesa.capacidad) {
        return respuestaDeError(
          "CAPACIDAD_EXCEDIDA",
          `La mesa ${mesa.numero} tiene capacidad para ${mesa.capacidad} personas.`,
        );
      }

      const mesaOcupada = guardarMesa({
        ...mesa,
        estado: "ocupada",
        personas: actual.personas,
        hora_llegada: ahora(),
        id_mesero_orden: null,
        estado_pedido: null,
        modificado_en: ahora(),
      });

      return respuestaDeExito({
        reserva: guardarReserva({ ...actual, estado: "Abierta" }),
        mesa: mesaOcupada,
      });
    }

    if (/^\/api\/mesas\/reservas\/\d+$/.test(ruta) && metodo === "PATCH") {
      const id = idDeLaRuta(ruta, /\/api\/mesas\/reservas\/(\d+)$/);
      const actual = reservaDe(id);

      if (actual === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa reserva no existe.",
          404,
        );
      }

      if (actual.estado !== "Pendiente") {
        return respuestaDeError(
          "RESERVA_NO_EDITABLE",
          `La reserva ya está ${actual.estado.toLowerCase()} y no se puede editar.`,
        );
      }

      const idMesa =
        cuerpo?.id_mesa === undefined ? actual.id_mesa : numero(cuerpo.id_mesa);
      const mesa = mesaDe(idMesa);
      const fecha =
        cuerpo?.fecha === undefined ? actual.fecha : texto(cuerpo.fecha);
      const hora =
        cuerpo?.hora === undefined ? actual.hora : texto(cuerpo.hora);
      const personas =
        cuerpo?.personas === undefined
          ? actual.personas
          : numero(cuerpo.personas);

      if (mesa === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa mesa no existe.",
          400,
        );
      }

      if (!mesa.zona_activa && idMesa !== actual.id_mesa) {
        return respuestaDeError(
          "ZONA_INACTIVA",
          `La zona "${mesa.zona}" está inactiva. Elige una mesa de una zona activa.`,
        );
      }

      if (personas > mesa.capacidad) {
        return respuestaDeError(
          "CAPACIDAD_EXCEDIDA",
          `La mesa ${mesa.numero} tiene capacidad para ${mesa.capacidad} personas.`,
        );
      }

      if (choqueDeReserva(idMesa, fecha, hora, id)) {
        return respuestaDeError(
          "RESERVA_DUPLICADA",
          "Ya hay una reserva para esa mesa, esa fecha y esa hora.",
        );
      }

      return respuestaDeExito(
        guardarReserva({
          ...actual,
          fecha,
          hora,
          nombre_cliente:
            cuerpo?.nombre_cliente === undefined
              ? actual.nombre_cliente
              : texto(cuerpo.nombre_cliente),
          telefono:
            cuerpo?.telefono === undefined
              ? actual.telefono
              : texto(cuerpo.telefono),
          personas,
          id_mesa: mesa.id_mesa,
          mesa_numero: mesa.numero,
          zona: mesa.zona,
        }),
      );
    }

    return respuestaDeError(
      "NO_ENCONTRADO",
      `La ruta de prueba ${metodo} ${url} no está preparada.`,
      404,
    );
  }

  return {
    manejador,
    peticiones,
    fallos,
    datos: () => datos,
    reservas: () => reservas,
  };
}
