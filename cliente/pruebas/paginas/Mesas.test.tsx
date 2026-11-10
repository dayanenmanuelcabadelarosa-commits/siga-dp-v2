/*
  Mesas.test.tsx — Mesas y reservas con la API sustituida.
  --------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que el servidor responde:

    • El mapa muestra zonas, capacidad, estado y personas, y no inventa mesas.
    • Registrar una llegada manda el estado y las personas, y refresca el mapa.
    • Los errores del servidor se quedan dentro de la ventana.
    • La agenda pide la fecha elegida y no mezcla reservas de otros días.
    • Crear, editar, cancelar y abrir reservas usan la API y refrescan la lista.
    • Abrir una reserva ocupa la mesa también en el mapa.
    • La configuración de zonas y mesas solo se ve con ADMINISTRAR_MESAS.
    • Una mesa con historial no se elimina y el mensaje del servidor se muestra.

  Que la base guarde de verdad lo comprueban las pruebas del servidor contra
  PostgreSQL. Aquí se simula el cable, no la base.
*/

import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatosDeMesas, Reserva } from "../../src/api/mesas";
import { Mesas } from "../../src/paginas/Mesas";
import { guardarSesion } from "../../src/sesion/almacen";
import { fechaDeHoy } from "../../src/utilidades/fecha";
import { URL_DE_PRUEBA, simularFetch } from "../ayudas/api-falsa";
import { apiDeMesas } from "../ayudas/api-de-mesas";
import type { ApiDeMesas, FalloDeMesas } from "../ayudas/api-de-mesas";
import {
  PERMISOS_DEL_GERENTE,
  montarConSesion,
  sesionFalsa,
} from "../ayudas/sesion-de-prueba";

const HOY = fechaDeHoy();

const DATOS: DatosDeMesas = {
  zonas: [
    { id_zona: 1, nombre: "Salón", tipo_ambiente: "Salón", activo: true },
    { id_zona: 2, nombre: "Terraza", tipo_ambiente: "Terraza", activo: true },
    { id_zona: 3, nombre: "Privado", tipo_ambiente: "Privado", activo: false },
  ],
  mesas: [
    {
      id_mesa: 1,
      numero: 1,
      id_zona: 1,
      zona: "Salón",
      tipo_ambiente: "Salón",
      zona_activa: true,
      capacidad: 4,
      estado: "libre",
      personas: null,
      hora_llegada: null,
      id_mesero_orden: null,
      mesero_orden: null,
      estado_pedido: null,
      creado_en: "2026-01-01T00:00:00.000Z",
      modificado_en: "2026-01-01T00:00:00.000Z",
    },
    {
      id_mesa: 2,
      numero: 2,
      id_zona: 1,
      zona: "Salón",
      tipo_ambiente: "Salón",
      zona_activa: true,
      capacidad: 2,
      estado: "ocupada",
      personas: 2,
      hora_llegada: "2026-10-19T18:30:00.000Z",
      id_mesero_orden: null,
      mesero_orden: null,
      estado_pedido: null,
      creado_en: "2026-01-01T00:00:00.000Z",
      modificado_en: "2026-01-01T00:00:00.000Z",
    },
    {
      id_mesa: 3,
      numero: 3,
      id_zona: 2,
      zona: "Terraza",
      tipo_ambiente: "Terraza",
      zona_activa: true,
      capacidad: 3,
      estado: "reservada",
      personas: 2,
      hora_llegada: null,
      id_mesero_orden: null,
      mesero_orden: null,
      estado_pedido: null,
      creado_en: "2026-01-01T00:00:00.000Z",
      modificado_en: "2026-01-01T00:00:00.000Z",
    },
  ],
};

function reserva(
  partes: Partial<Reserva> & Pick<Reserva, "id_reserva" | "nombre_cliente">,
): Reserva {
  return {
    ...partes,
    fecha: partes.fecha ?? HOY,
    hora: partes.hora ?? "19:30",
    telefono: partes.telefono ?? "809-555-0101",
    personas: partes.personas ?? 2,
    id_mesa: partes.id_mesa ?? 1,
    mesa_numero: partes.mesa_numero ?? 1,
    zona: partes.zona ?? "Salón",
    estado: partes.estado ?? "Pendiente",
    motivo_cancelacion: partes.motivo_cancelacion ?? null,
    id_mesero_asignado: partes.id_mesero_asignado ?? null,
    creado_en: partes.creado_en ?? "2026-01-01T00:00:00.000Z",
  };
}

const RESERVAS: Reserva[] = [
  reserva({ id_reserva: 1, nombre_cliente: "Ana Pérez" }),
  reserva({
    id_reserva: 2,
    nombre_cliente: "Carlos Ruiz",
    hora: "18:00",
    id_mesa: 3,
    mesa_numero: 3,
    zona: "Terraza",
    estado: "Cancelada",
    motivo_cancelacion: "El cliente avisó que no puede llegar.",
  }),
];

function montar(
  opciones: {
    datos?: DatosDeMesas;
    reservas?: Reserva[];
    permisos?: string[];
    fallos?: FalloDeMesas[];
  } = {},
): ApiDeMesas {
  const api = apiDeMesas(
    opciones.datos ?? DATOS,
    opciones.reservas ?? RESERVAS,
  );

  api.fallos.push(...(opciones.fallos ?? []));
  simularFetch(api.manejador);

  montarConSesion(<Mesas />, {
    sesion: sesionFalsa({
      permisos: opciones.permisos ?? PERMISOS_DEL_GERENTE,
    }),
  });

  return api;
}

async function irAReservas(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Reservas" }));
  await screen.findByText("Ana Pérez");
}

function tarjetaDeReserva(nombre: string): HTMLElement {
  const tarjeta = screen.getByText(nombre).closest("li");

  if (tarjeta === null) {
    throw new Error(`No se encontró la tarjeta de ${nombre}.`);
  }

  return tarjeta;
}

function peticion(
  api: ApiDeMesas,
  metodo: string,
  sufijo: string,
):
  | { url: string; metodo: string; cuerpo: Record<string, unknown> | null }
  | undefined {
  return api.peticiones.find(
    (posible) => posible.metodo === metodo && posible.url.endsWith(sufijo),
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", URL_DE_PRUEBA);
  guardarSesion({
    token: "token-de-prueba",
    expiraEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("Mesas", () => {
  it("muestra el mapa con zonas, capacidad, estados y personas", async () => {
    montar();

    expect(
      await screen.findByRole("heading", { name: "Mesas y reservas" }),
    ).toBeInTheDocument();

    const mesaUno = screen.getByRole("button", {
      name: "Mesa 1, Salón, Libre, capacidad 4",
    });

    expect(mesaUno).toHaveTextContent("Capacidad para 4 personas");
    expect(screen.getByText("1 libre")).toBeInTheDocument();
    expect(screen.getByText("1 ocupada")).toBeInTheDocument();
    expect(screen.getByText("0 en limpieza")).toBeInTheDocument();

    const mesaDos = screen.getByRole("button", {
      name: "Mesa 2, Salón, Ocupada, capacidad 2",
    });

    expect(mesaDos).toHaveTextContent("2 personas");

    const mesaTres = screen.getByRole("button", {
      name: "Mesa 3, Terraza, Reservada, capacidad 3",
    });

    expect(mesaTres).toHaveTextContent("Mesa 3");
  });

  it("una mesa ocupada ofrece 'Tomar pedido' y abre el pedido de esa mesa en la misma pantalla", async () => {
    montar();

    fireEvent.click(await screen.findByRole("button", { name: /Mesa 2,/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Tomar pedido" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Pedido de la mesa 2" }),
    ).toBeInTheDocument();
  });

  it("una mesa libre no ofrece 'Tomar pedido'", async () => {
    montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Mesa 1, Salón, Libre, capacidad 4",
      }),
    );

    await screen.findByRole("button", { name: "Registrar llegada" });
    expect(screen.queryByRole("button", { name: "Tomar pedido" })).toBeNull();
  });

  it("registra una llegada, manda personas y refresca la mesa", async () => {
    const api = montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Mesa 1, Salón, Libre, capacidad 4",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Registrar llegada" }));

    const dialogo = await screen.findByRole("dialog", {
      name: "Llegada a la mesa 1",
    });

    fireEvent.change(within(dialogo).getByLabelText("Personas que llegaron"), {
      target: { value: "3" },
    });

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Ocupar mesa" }),
    );

    expect(
      await screen.findByText("La mesa 1 quedó ocupada con 3 personas."),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Mesa 1, Salón, Ocupada, capacidad 4",
      }),
    ).toHaveTextContent("3 personas");

    expect(peticion(api, "PATCH", "/api/mesas/1/estado")?.cuerpo).toEqual({
      estado: "ocupada",
      personas: 3,
    });
  });

  it("si el servidor rechaza la llegada, el mensaje se queda en la ventana", async () => {
    const api = montar();

    api.fallos.push({
      metodo: "PATCH",
      sufijo: "/api/mesas/1/estado",
      codigo: "CAPACIDAD_EXCEDIDA",
      mensaje: "La mesa 1 tiene capacidad para 4 personas.",
      estado: 409,
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Mesa 1, Salón, Libre, capacidad 4",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Registrar llegada" }));

    const dialogo = await screen.findByRole("dialog", {
      name: "Llegada a la mesa 1",
    });

    fireEvent.change(within(dialogo).getByLabelText("Personas que llegaron"), {
      target: { value: "2" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Ocupar mesa" }),
    );

    expect(
      await within(dialogo).findByText(
        "La mesa 1 tiene capacidad para 4 personas.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("dialog", { name: "Llegada a la mesa 1" }),
    ).toBeInTheDocument();
  });

  it("si el mapa no carga, lo dice y deja reintentar", async () => {
    const api = montar({
      fallos: [
        {
          metodo: "GET",
          sufijo: "/api/mesas",
          codigo: "ERROR_INTERNO",
          mensaje: "No se pudo cargar el salón.",
          estado: 500,
        },
      ],
    });

    const alerta = await screen.findByRole("alert");

    expect(
      within(alerta).getByText("No se pudo cargar el salón"),
    ).toBeInTheDocument();

    api.fallos.splice(0);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(
      await screen.findByRole("button", {
        name: "Mesa 1, Salón, Libre, capacidad 4",
      }),
    ).toBeInTheDocument();
  });

  it("la agenda pide la fecha elegida y no mezcla otros días", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Mesas y reservas" });
    await irAReservas();

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Carlos Ruiz")).toBeInTheDocument();

    const fecha = screen.getByLabelText("Fecha de la agenda");
    expect(fecha).toHaveValue(HOY);

    fireEvent.change(fecha, { target: { value: "2030-01-15" } });

    expect(await screen.findByText(/No hay reservas para/)).toBeInTheDocument();

    expect(
      api.peticiones.some((posible) =>
        posible.url.includes("fecha=2030-01-15"),
      ),
    ).toBe(true);
  });

  it("crea una reserva y la deja en la agenda", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Mesas y reservas" });
    await irAReservas();

    fireEvent.click(screen.getByRole("button", { name: "Nueva reserva" }));

    const dialogo = await screen.findByRole("dialog", {
      name: "Nueva reserva",
    });

    fireEvent.change(within(dialogo).getByLabelText("Hora"), {
      target: { value: "20:00" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Nombre del cliente"), {
      target: { value: "Cliente nuevo" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Teléfono"), {
      target: { value: "809-555-0202" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Personas"), {
      target: { value: "3" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Mesa"), {
      target: { value: "3" },
    });

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Crear reserva" }),
    );

    expect(await screen.findByText("Cliente nuevo")).toBeInTheDocument();

    expect(peticion(api, "POST", "/api/mesas/reservas")?.cuerpo).toEqual({
      fecha: HOY,
      hora: "20:00",
      nombre_cliente: "Cliente nuevo",
      telefono: "809-555-0202",
      personas: 3,
      id_mesa: 3,
    });
  });

  it("edita una reserva pendiente y refresca su tarjeta", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Mesas y reservas" });
    await irAReservas();

    fireEvent.click(
      within(tarjetaDeReserva("Ana Pérez")).getByRole("button", {
        name: "Editar",
      }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Editar reserva",
    });

    fireEvent.change(within(dialogo).getByLabelText("Hora"), {
      target: { value: "20:30" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Nombre del cliente"), {
      target: { value: "Ana Pérez actualizada" },
    });

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar cambios" }),
    );

    expect(
      await screen.findByText("Ana Pérez actualizada"),
    ).toBeInTheDocument();

    expect(
      peticion(api, "PATCH", "/api/mesas/reservas/1")?.cuerpo,
    ).toMatchObject({ hora: "20:30", nombre_cliente: "Ana Pérez actualizada" });
  });

  it("cancela una reserva con su motivo y la conserva en la agenda", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Mesas y reservas" });
    await irAReservas();

    fireEvent.click(
      within(tarjetaDeReserva("Ana Pérez")).getByRole("button", {
        name: "Cancelar",
      }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Cancelar la reserva de Ana Pérez",
    });

    fireEvent.change(
      within(dialogo).getByLabelText("Motivo de la cancelación"),
      { target: { value: "El cliente no puede llegar." } },
    );

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Cancelar reserva" }),
    );

    const tarjeta = await screen.findByText("Ana Pérez");
    expect(tarjeta.closest("li")).toHaveTextContent("Cancelada");
    expect(tarjeta.closest("li")).toHaveTextContent(
      "Motivo: El cliente no puede llegar.",
    );

    expect(
      peticion(api, "POST", "/api/mesas/reservas/1/cancelar")?.cuerpo,
    ).toEqual({ motivo_cancelacion: "El cliente no puede llegar." });
  });

  it("abre una reserva y deja la mesa ocupada en el mapa", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Mesas y reservas" });
    await irAReservas();

    fireEvent.click(
      within(tarjetaDeReserva("Ana Pérez")).getByRole("button", {
        name: "Abrir reserva",
      }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Abrir reserva",
    });

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Abrir y ocupar mesa" }),
    );

    expect(
      await screen.findByText(
        "La mesa está ocupada desde que se abrió la reserva.",
      ),
    ).toBeInTheDocument();

    expect(peticion(api, "POST", "/api/mesas/reservas/1/abrir")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Mapa de mesas" }));

    expect(
      await screen.findByRole("button", {
        name: "Mesa 1, Salón, Ocupada, capacidad 4",
      }),
    ).toBeInTheDocument();
  });

  it("si el servidor no deja abrir la reserva, el mensaje se queda en el diálogo", async () => {
    const api = montar();

    api.fallos.push({
      metodo: "POST",
      sufijo: "/api/mesas/reservas/1/abrir",
      codigo: "MESA_OCUPADA",
      mensaje: "La mesa de esa reserva ya está ocupada.",
      estado: 409,
    });

    await screen.findByRole("heading", { name: "Mesas y reservas" });
    await irAReservas();

    fireEvent.click(
      within(tarjetaDeReserva("Ana Pérez")).getByRole("button", {
        name: "Abrir reserva",
      }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Abrir reserva",
    });

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Abrir y ocupar mesa" }),
    );

    expect(
      await within(dialogo).findByText(
        "La mesa de esa reserva ya está ocupada.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("dialog", { name: "Abrir reserva" }),
    ).toBeInTheDocument();
  });

  it("solo muestra la configuración de zonas y mesas con ADMINISTRAR_MESAS", async () => {
    montar({
      permisos: ["ASIGNAR_MESA", "GESTIONAR_RESERVA", "VER_MESAS"],
    });

    await screen.findByRole("heading", { name: "Mesas y reservas" });

    expect(
      screen.queryByRole("button", { name: "Zonas y mesas" }),
    ).not.toBeInTheDocument();
  });

  it("crea una zona y una mesa desde la configuración", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Mesas y reservas" });

    fireEvent.click(screen.getByRole("button", { name: "Zonas y mesas" }));

    const dialogo = await screen.findByRole("dialog", {
      name: "Zonas y mesas",
    });

    fireEvent.change(within(dialogo).getByLabelText("Nombre"), {
      target: { value: "Barra" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Tipo de ambiente"), {
      target: { value: "Barra" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Crear zona" }),
    );

    expect(
      await within(dialogo).findByText('Se creó la zona "Barra".'),
    ).toBeInTheDocument();

    fireEvent.click(within(dialogo).getByRole("tab", { name: "Mesas" }));

    fireEvent.change(within(dialogo).getByLabelText("Número"), {
      target: { value: "5" },
    });

    const selectorDeZona = within(dialogo).getByLabelText("Zona");
    const opcionBarra = within(dialogo).getByRole<HTMLOptionElement>("option", {
      name: "Barra",
    });

    fireEvent.change(selectorDeZona, {
      target: { value: opcionBarra.value },
    });
    fireEvent.change(within(dialogo).getByLabelText("Capacidad"), {
      target: { value: "4" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Crear mesa" }),
    );

    expect(
      await within(dialogo).findByText("Se creó la mesa 5."),
    ).toBeInTheDocument();

    expect(api.datos().zonas.some((zona) => zona.nombre === "Barra")).toBe(
      true,
    );
    expect(api.datos().mesas.some((mesa) => mesa.numero === 5)).toBe(true);
  });

  it("no elimina una mesa con historial y muestra el mensaje del servidor", async () => {
    montar();

    await screen.findByRole("heading", { name: "Mesas y reservas" });
    fireEvent.click(screen.getByRole("button", { name: "Zonas y mesas" }));

    const dialogo = await screen.findByRole("dialog", {
      name: "Zonas y mesas",
    });

    fireEvent.click(within(dialogo).getByRole("tab", { name: "Mesas" }));

    const fila = within(dialogo).getByText("Mesa 1").closest("li");

    if (fila === null) {
      throw new Error("No se encontró la fila de la mesa 1.");
    }

    fireEvent.click(
      within(fila).getByRole("button", { name: "Eliminar la mesa 1" }),
    );

    fireEvent.click(
      await within(dialogo).findByRole("button", { name: "Sí, eliminar" }),
    );

    expect(
      await within(dialogo).findAllByText(
        /La mesa 1 tiene reservas o servicios registrados/,
      ),
    ).not.toHaveLength(0);

    expect(
      within(dialogo).getByText("¿Eliminar la mesa 1?"),
    ).toBeInTheDocument();
  });
});
