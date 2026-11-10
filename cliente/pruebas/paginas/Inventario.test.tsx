/*
  Inventario.test.tsx — la pantalla de Inventario, con la API sustituida.
  ----------------------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que el servidor responde:

    · La lista muestra la existencia total, el mínimo y el estado de cada
      insumo; el aviso de bajo mínimo no inventa filas.
    · El filtro por punto y la búsqueda cambian lo que se ve, sin mezclar
      puntos.
    · El historial muestra los tres tipos de movimiento con su signo y se puede
      filtrar por insumo.
    · La cocina, que solo tiene VER_EXISTENCIAS, no ve los controles de mover ni
      administrar, y lee un aviso honesto.
    · Registrar una entrada manda el cuerpo correcto y refresca la existencia.
    · Una salida que no alcanza deja el mensaje del servidor dentro de la
      ventana y no cambia la tabla.
    · El ajuste muestra la existencia actual, bloquea el conteo sin diferencia
      y manda el conteo, no la diferencia calculada.
    · Los insumos y proveedores se crean y se editan desde su sección; un
      insumo con movimientos no cambia de unidad y el error se queda visible.
    · Si la carga falla, se explica y el botón Reintentar vuelve a pedir todo.

  Que la base guarde de verdad lo comprueban las pruebas del servidor contra
  PostgreSQL. Aquí se simula el cable, no la base.
*/

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Inventario } from "../../src/paginas/Inventario";
import { guardarSesion } from "../../src/sesion/almacen";
import {
  URL_DE_PRUEBA,
  simularFetch,
} from "../ayudas/api-falsa";
import {
  apiDeInventario,
  estadoDeInventarioDePrueba,
} from "../ayudas/api-de-inventario";
import type { ApiDeInventario } from "../ayudas/api-de-inventario";
import {
  PERMISOS_DEL_GERENTE,
  montarConSesion,
  sesionFalsa,
} from "../ayudas/sesion-de-prueba";

const PERMISOS_DE_COCINA = ["VER_EXISTENCIAS"];

function montar(permisos: string[] = PERMISOS_DEL_GERENTE): ApiDeInventario {
  const api = apiDeInventario(estadoDeInventarioDePrueba());

  simularFetch(api.manejador);

  montarConSesion(<Inventario />, {
    sesion: sesionFalsa({ permisos }),
  });

  return api;
}

function tabla(titulo: string): HTMLElement {
  return screen.getByRole("table", { name: titulo });
}

function filaDe(titulo: string, texto: string): HTMLElement {
  const fila = within(tabla(titulo)).getByText(texto).closest("tr");

  if (fila === null) {
    throw new Error(`No se encontró la fila de ${texto}.`);
  }

  return fila;
}

function filaConTexto(titulo: string, texto: string): HTMLElement {
  const fila = within(tabla(titulo)).getByText(texto).closest("tr");

  if (fila === null) {
    throw new Error(`No se encontró la fila con ${texto}.`);
  }

  return fila;
}

function pulsarPestana(grupo: string, texto: string): void {
  const pestanas = screen.getByRole("group", { name: grupo });
  fireEvent.click(within(pestanas).getByRole("button", { name: texto }));
}

async function abrirMovimiento(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));
  return screen.findByRole("dialog", { name: "Registrar movimiento" });
}

function enviarMovimiento(dialogo: HTMLElement): void {
  fireEvent.click(
    within(dialogo).getByRole("button", { name: "Registrar movimiento" }),
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

describe("Inventario", () => {
  it("muestra existencias, mínimo, estado y el aviso de bajo mínimo", async () => {
    montar();

    expect(
      await screen.findByRole("heading", { name: "Inventario" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("3 insumos · 1 por debajo del mínimo · 2 puntos."),
    ).toBeInTheDocument();

    expect(screen.getByText("Hay insumos bajo el mínimo")).toBeInTheDocument();
    expect(
      screen.getByText(/quedan 3 und y el mínimo es 5 und/),
    ).toBeInTheDocument();

    const filaPollo = filaDe("Existencias de insumos", "Pollo");
    expect(filaPollo).toHaveTextContent("Unidad (und)");
    expect(filaPollo).toHaveTextContent("3 und");
    expect(filaPollo).toHaveTextContent("Bajo mínimo");

    const filaAceite = filaDe("Existencias de insumos", "Aceite");
    expect(filaAceite).toHaveTextContent("Libra (lb)");
    expect(filaAceite).toHaveTextContent("10 lb");
    expect(filaAceite).toHaveTextContent("Suficiente");

    const filaCarbon = filaDe("Existencias de insumos", "Carbón viejo");
    expect(filaCarbon).toHaveTextContent("Inactivo");
  });

  it("filtra por punto de acceso y por nombre sin mezclar los puntos", async () => {
    montar();

    await screen.findByRole("heading", { name: "Inventario" });

    pulsarPestana("Filtrar existencias por punto", "Cocina");

    expect(
      await screen.findByText("Mostrando la existencia en Cocina."),
    ).toBeInTheDocument();

    expect(filaDe("Existencias de insumos", "Pollo")).toHaveTextContent(
      "1 und",
    );
    expect(filaDe("Existencias de insumos", "Aceite")).toHaveTextContent(
      "0 lb",
    );

    fireEvent.change(screen.getByLabelText("Buscar insumo"), {
      target: { value: "Ace" },
    });

    const visibles = tabla("Existencias de insumos");
    expect(within(visibles).getByText("Aceite")).toBeInTheDocument();
    expect(within(visibles).queryByText("Pollo")).not.toBeInTheDocument();
  });

  it("muestra el historial con signos y lo filtra por insumo", async () => {
    montar();

    await screen.findByRole("heading", { name: "Inventario" });

    pulsarPestana("Secciones del inventario", "Movimientos");

    const historial = tabla("Historial de movimientos de inventario");

    expect(screen.getByText("3 movimientos en total.")).toBeInTheDocument();

    const salida = filaConTexto(
      "Historial de movimientos de inventario",
      "Consumo del almuerzo",
    );
    expect(salida).toHaveTextContent("Salida por consumo");
    expect(salida).toHaveTextContent("-1 und");
    expect(salida).toHaveTextContent("Ana Pérez");

    const entrada = filaConTexto(
      "Historial de movimientos de inventario",
      "Factura A-1",
    );
    expect(entrada).toHaveTextContent("Entrada de compra");
    expect(entrada).toHaveTextContent("+2 und");
    expect(entrada).toHaveTextContent("Avícola del Cibao");

    expect(within(historial).getByText("Factura A-2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filtrar por insumo"), {
      target: { value: "2" },
    });

    expect(
      await screen.findByText("Mostrando 1 de 3 movimientos."),
    ).toBeInTheDocument();
    expect(within(historial).getByText("Factura A-2")).toBeInTheDocument();
    expect(within(historial).queryByText("Factura A-1")).not.toBeInTheDocument();
  });

  it("la cocina solo consulta: no ve mover ni administrar", async () => {
    const api = montar(PERMISOS_DE_COCINA);

    await screen.findByRole("heading", { name: "Inventario" });

    expect(
      screen.queryByRole("button", { name: "Registrar movimiento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Administrar insumos y proveedores",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Insumos y proveedores" }),
    ).not.toBeInTheDocument();

    pulsarPestana("Secciones del inventario", "Movimientos");

    expect(
      await screen.findByText("Solo lectura"),
    ).toBeInTheDocument();

    expect(
      api.peticiones.some((peticion) =>
        peticion.url.endsWith("/api/inventario/proveedores"),
      ),
    ).toBe(false);
  });

  it("registra una entrada y refresca la existencia", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Inventario" });

    const dialogo = await abrirMovimiento();

    fireEvent.change(within(dialogo).getByLabelText("Cantidad"), {
      target: { value: "4" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Detalle"), {
      target: { value: "Factura B-2" },
    });

    enviarMovimiento(dialogo);

    expect(
      await screen.findByText(
        /Entrada registrada: \+4 und de "Pollo"\. Existencia en Almacén: 6 und\./,
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(filaDe("Existencias de insumos", "Pollo")).toHaveTextContent(
        "7 und",
      );
    });

    expect(
      screen.queryByRole("dialog", { name: "Registrar movimiento" }),
    ).not.toBeInTheDocument();

    const peticion = api.peticiones.filter(
      (candidata) => candidata.metodo === "POST",
    ).at(-1);

    expect(peticion?.cuerpo).toMatchObject({
      tipo: "Entrada de compra",
      id_insumo: 1,
      id_punto: 1,
      cantidad: "4",
      detalle: "Factura B-2",
      id_proveedor: 1,
    });
  });

  it("una salida que no alcanza deja el error del servidor en la ventana", async () => {
    montar();

    await screen.findByRole("heading", { name: "Inventario" });

    const dialogo = await abrirMovimiento();

    fireEvent.change(within(dialogo).getByLabelText("Tipo de movimiento"), {
      target: { value: "Salida por consumo" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Cantidad"), {
      target: { value: "99" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Detalle"), {
      target: { value: "Consumo de prueba" },
    });

    enviarMovimiento(dialogo);

    expect(
      await within(dialogo).findByText(
        "Solo hay 2 en ese punto. No puedes sacar 99.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("dialog", { name: "Registrar movimiento" }),
    ).toBeInTheDocument();
    expect(filaDe("Existencias de insumos", "Pollo")).toHaveTextContent(
      "3 und",
    );
  });

  it("el ajuste muestra la existencia y guarda la diferencia, no el conteo", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Inventario" });

    const dialogo = await abrirMovimiento();

    fireEvent.change(within(dialogo).getByLabelText("Tipo de movimiento"), {
      target: { value: "Ajuste por conteo" },
    });

    expect(dialogo).toHaveTextContent(
      "Existencia actual en Almacén: 2 und.",
    );

    const conteo = within(dialogo).getByLabelText("Conteo físico");

    fireEvent.change(conteo, { target: { value: "2" } });
    enviarMovimiento(dialogo);

    expect(
      await within(dialogo).findByText(
        "El conteo coincide con la existencia actual. No hay nada que ajustar.",
      ),
    ).toBeInTheDocument();
    expect(
      api.peticiones.filter((peticion) => peticion.metodo === "POST"),
    ).toHaveLength(0);

    fireEvent.change(conteo, { target: { value: "5" } });
    expect(dialogo).toHaveTextContent(
      "Se guardará una diferencia de +3 und.",
    );

    enviarMovimiento(dialogo);

    expect(
      await screen.findByText(
        /Ajuste registrado: \+3 und de "Pollo"\. Existencia en Almacén: 5 und\./,
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(filaDe("Existencias de insumos", "Pollo")).toHaveTextContent(
        "6 und",
      );
    });

    const peticion = api.peticiones.filter(
      (candidata) => candidata.metodo === "POST",
    ).at(-1);

    expect(peticion?.cuerpo).toEqual({
      tipo: "Ajuste por conteo",
      id_insumo: 1,
      id_punto: 1,
      conteo_fisico: "5",
    });
  });

  it("crea y edita insumos; un insumo con movimientos no cambia de unidad", async () => {
    const api = montar();

    await screen.findByRole("heading", { name: "Inventario" });

    pulsarPestana("Secciones del inventario", "Insumos y proveedores");

    expect(
      await screen.findByRole("heading", { name: "Insumos" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo insumo" }));

    const nuevo = await screen.findByRole("dialog", {
      name: "Nuevo insumo",
    });

    fireEvent.click(
      within(nuevo).getByRole("button", { name: "Crear insumo" }),
    );

    expect(
      within(nuevo).getByText("Escribe el nombre del insumo."),
    ).toBeInTheDocument();
    expect(
      within(nuevo).getByText("Elige una unidad de medida."),
    ).toBeInTheDocument();
    expect(
      within(nuevo).getByText("Escribe el mínimo de reposición."),
    ).toBeInTheDocument();
    expect(
      api.peticiones.filter((peticion) => peticion.metodo === "POST"),
    ).toHaveLength(0);

    fireEvent.change(within(nuevo).getByLabelText("Nombre"), {
      target: { value: "Arroz" },
    });
    fireEvent.change(within(nuevo).getByLabelText("Unidad de medida"), {
      target: { value: "1" },
    });
    fireEvent.change(within(nuevo).getByLabelText("Mínimo"), {
      target: { value: "4.50" },
    });

    fireEvent.click(
      within(nuevo).getByRole("button", { name: "Crear insumo" }),
    );

    expect(
      await screen.findByText('Se creó el insumo "Arroz".'),
    ).toBeInTheDocument();
    expect(filaDe("Insumos registrados", "Arroz")).toHaveTextContent("4.5");

    fireEvent.click(
      screen.getByRole("button", { name: "Editar insumo Aceite" }),
    );

    const editar = await screen.findByRole("dialog", {
      name: "Editar insumo",
    });

    fireEvent.change(within(editar).getByLabelText("Nombre"), {
      target: { value: "Aceite de oliva" },
    });
    fireEvent.change(within(editar).getByLabelText("Mínimo"), {
      target: { value: "3" },
    });

    fireEvent.click(
      within(editar).getByRole("button", { name: "Guardar cambios" }),
    );

    expect(
      await screen.findByText('Se actualizó el insumo "Aceite de oliva".'),
    ).toBeInTheDocument();
    expect(
      filaDe("Insumos registrados", "Aceite de oliva"),
    ).toHaveTextContent("3");

    fireEvent.click(
      screen.getByRole("button", { name: "Editar insumo Pollo" }),
    );

    const conMovimientos = await screen.findByRole("dialog", {
      name: "Editar insumo",
    });

    fireEvent.change(
      within(conMovimientos).getByLabelText("Unidad de medida"),
      { target: { value: "2" } },
    );
    fireEvent.click(
      within(conMovimientos).getByRole("button", {
        name: "Guardar cambios",
      }),
    );

    expect(
      await within(conMovimientos).findByText(
        /ya tiene movimientos\. La unidad no se puede cambiar/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Editar insumo" }),
    ).toBeInTheDocument();
  });

  it("crea proveedores y los desactiva sin borrarlos", async () => {
    montar();

    await screen.findByRole("heading", { name: "Inventario" });

    pulsarPestana("Secciones del inventario", "Insumos y proveedores");

    expect(
      await screen.findByRole("heading", { name: "Insumos" }),
    ).toBeInTheDocument();

    pulsarPestana("Administración del inventario", "Proveedores");

    expect(
      await screen.findByRole("heading", { name: "Proveedores" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo proveedor" }));

    const nuevo = await screen.findByRole("dialog", {
      name: "Nuevo proveedor",
    });

    fireEvent.change(within(nuevo).getByLabelText("Nombre"), {
      target: { value: "Distribuidora del Este" },
    });
    fireEvent.change(within(nuevo).getByLabelText("Teléfono"), {
      target: { value: "809-555-0303" },
    });

    fireEvent.click(
      within(nuevo).getByRole("button", { name: "Crear proveedor" }),
    );

    expect(
      await screen.findByText('Se creó el proveedor "Distribuidora del Este".'),
    ).toBeInTheDocument();
    expect(
      filaDe("Proveedores registrados", "Distribuidora del Este"),
    ).toHaveTextContent("809-555-0303");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Editar proveedor Avícola del Cibao",
      }),
    );

    const editar = await screen.findByRole("dialog", {
      name: "Editar proveedor",
    });

    fireEvent.change(within(editar).getByLabelText("Estado"), {
      target: { value: "Inactivo" },
    });
    fireEvent.click(
      within(editar).getByRole("button", { name: "Guardar cambios" }),
    );

    expect(
      await screen.findByText(
        'Se actualizó el proveedor "Avícola del Cibao".',
      ),
    ).toBeInTheDocument();
    expect(
      filaDe("Proveedores registrados", "Avícola del Cibao"),
    ).toHaveTextContent("Inactivo");
  });

  it("si la carga falla, lo explica y Reintentar vuelve a pedir los datos", async () => {
    const api = apiDeInventario(estadoDeInventarioDePrueba());

    api.fallos.push({
      metodo: "GET",
      sufijo: "/api/inventario",
      codigo: "SIN_CONEXION",
      mensaje: "No se pudo conectar con el servidor.",
      estado: 500,
    });

    simularFetch(api.manejador);

    montarConSesion(<Inventario />, {
      sesion: sesionFalsa({ permisos: PERMISOS_DEL_GERENTE }),
    });

    expect(
      await screen.findByText("No se pudo cargar el inventario"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No se pudo conectar con el servidor."),
    ).toBeInTheDocument();

    api.fallos.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(
      await screen.findByRole("table", { name: "Existencias de insumos" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar el inventario")).not.toBeInTheDocument();
  });
});
