/*
  Productos.test.tsx — la pantalla de Productos y catálogo, con la API sustituida.
  -------------------------------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que el servidor responde:

    · La lista muestra el catálogo y la disponibilidad por separado, con sus
      acciones y los dos estados de cada producto.
    · Buscar y filtrar por categoría, agotados o inactivos no inventa filas.
    · Crear manda el cuerpo completo y refresca la tabla.
    · Los errores de validación no hacen peticiones; los del servidor se quedan
      dentro de la ventana, con su mensaje.
    · Editar conserva la categoría inactiva actual y avisa; no deja elegirla al
      crear.
    · La disponibilidad se cambia sin confirmación; la baja y la reactivación
      piden confirmación y conservan la disponibilidad.
    · Una categoría con productos activos no se puede desactivar; una vacía sí.
    · Las categorías y las estaciones se crean y se renombran desde la ventana.

  Que la base guarde de verdad lo comprueban las pruebas del servidor contra
  PostgreSQL. Aquí se simula el cable, no la base.
*/

import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Categoria,
  DatosDeProductos,
  Estacion,
  Producto,
} from "../../src/api/productos";
import { Productos } from "../../src/paginas/Productos";
import { guardarSesion } from "../../src/sesion/almacen";
import {
  URL_DE_PRUEBA,
  respuestaDeError,
  respuestaDeExito,
  simularFetch,
} from "../ayudas/api-falsa";
import { apiDeProductos } from "../ayudas/api-de-productos";
import type { ApiDeProductos } from "../ayudas/api-de-productos";
import {
  PERMISOS_DEL_GERENTE,
  montarConSesion,
  sesionFalsa,
} from "../ayudas/sesion-de-prueba";

const CATEGORIAS: Categoria[] = [
  { id_categoria: 1, nombre: "Platos fuertes", activo: true },
  { id_categoria: 2, nombre: "Bebidas", activo: true },
  { id_categoria: 3, nombre: "Temporada", activo: false },
  { id_categoria: 4, nombre: "Postres", activo: true },
  { id_categoria: 5, nombre: "Parrilla", activo: true },
];

const ESTACIONES: Estacion[] = [
  { id_estacion: 1, nombre: "Cocina" },
  { id_estacion: 2, nombre: "Barra" },
  { id_estacion: 3, nombre: "Parrilla" },
];

const POLLO: Producto = {
  id_producto: 1,
  nombre: "Pollo a la brasa",
  id_categoria: 1,
  categoria: "Platos fuertes",
  categoria_activa: true,
  id_estacion: 1,
  estacion: "Cocina",
  precio: 350,
  disponible: true,
  riesgo_agotarse: false,
  tiempo_estimado_minutos: null,
  activo: true,
  creado_en: "2026-01-01T00:00:00.000Z",
  modificado_en: "2026-01-01T00:00:00.000Z",
};

const CHULETA: Producto = {
  ...POLLO,
  id_producto: 2,
  nombre: "Chuleta de cerdo",
  precio: 425.5,
  disponible: false,
  riesgo_agotarse: true,
};

const SANGRIA: Producto = {
  ...POLLO,
  id_producto: 3,
  nombre: "Sangría de la casa",
  id_categoria: 2,
  categoria: "Bebidas",
  id_estacion: 2,
  estacion: "Barra",
  precio: 180,
};

const VIEJO: Producto = {
  ...POLLO,
  id_producto: 4,
  nombre: "Producto viejo",
  id_categoria: 3,
  categoria: "Temporada",
  categoria_activa: false,
  precio: 150,
  activo: false,
};

const DATOS: DatosDeProductos = {
  productos: [POLLO, CHULETA, SANGRIA, VIEJO],
  categorias: CATEGORIAS,
  estaciones: ESTACIONES,
};

const DATOS_VACIOS: DatosDeProductos = {
  productos: [],
  categorias: [],
  estaciones: [],
};

function montar(datos: DatosDeProductos = DATOS): ApiDeProductos {
  const api = apiDeProductos(datos);

  simularFetch(api.manejador);

  montarConSesion(<Productos />, {
    sesion: sesionFalsa({ permisos: PERMISOS_DEL_GERENTE }),
  });

  return api;
}

function tabla(): HTMLElement {
  return screen.getByRole("table", { name: "Catálogo de productos" });
}

function filaDe(nombre: string): HTMLElement {
  const fila = within(tabla()).getByText(nombre).closest("tr");

  if (fila === null) {
    throw new Error(`No se encontró la fila de ${nombre}.`);
  }

  return fila;
}

async function abrirNuevo(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
  return screen.findByRole("dialog", { name: "Nuevo producto" });
}

function llenarProducto(
  dialogo: HTMLElement,
  {
    nombre = "Costillas",
    precio = "495.50",
    categoria = "1",
    estacion = "1",
  }: {
    nombre?: string;
    precio?: string;
    categoria?: string;
    estacion?: string;
  } = {},
): void {
  fireEvent.change(within(dialogo).getByLabelText("Nombre"), {
    target: { value: nombre },
  });
  fireEvent.change(within(dialogo).getByLabelText("Precio"), {
    target: { value: precio },
  });
  fireEvent.change(within(dialogo).getByLabelText("Categoría"), {
    target: { value: categoria },
  });
  fireEvent.change(within(dialogo).getByLabelText("Estación"), {
    target: { value: estacion },
  });
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

describe("Productos", () => {
  it("muestra el catálogo con el estado del producto y su disponibilidad por separado", async () => {
    montar();

    expect(
      await screen.findByRole("heading", { name: "Productos y catálogo" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "4 productos · 2 disponibles · 1 agotado · 1 inactivo.",
      ),
    ).toBeInTheDocument();

    const filaPollo = filaDe("Pollo a la brasa");
    expect(filaPollo).toHaveTextContent("Platos fuertes");
    expect(filaPollo).toHaveTextContent("Cocina");
    expect(filaPollo).toHaveTextContent("RD$ 350.00");
    expect(filaPollo).toHaveTextContent("Activo");
    expect(filaPollo).toHaveTextContent("Disponible");

    const filaChuleta = filaDe("Chuleta de cerdo");
    expect(filaChuleta).toHaveTextContent("RD$ 425.50");
    expect(filaChuleta).toHaveTextContent("Agotado");
    expect(filaChuleta).toHaveTextContent("Por agotarse");

    const filaViejo = filaDe("Producto viejo");
    expect(filaViejo).toHaveTextContent("Inactivo");
    expect(filaViejo).toHaveTextContent("Categoría inactiva");
    expect(filaViejo).toHaveTextContent("Disponible");

    expect(
      screen.getByRole("button", { name: "Editar Pollo a la brasa" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Marcar como agotado: Pollo a la brasa",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Dar de baja Pollo a la brasa",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Marcar como disponible: Chuleta de cerdo",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Reactivar Producto viejo" }),
    ).toBeDisabled();
  });

  it("busca por nombre y filtra por categoría, agotados o inactivos", async () => {
    montar();
    await screen.findByText("Pollo a la brasa");

    const buscador = screen.getByRole("searchbox", {
      name: "Buscar producto",
    });

    fireEvent.change(buscador, { target: { value: "pollo" } });

    expect(within(tabla()).getByText("Pollo a la brasa")).toBeInTheDocument();
    expect(within(tabla()).queryByText("Chuleta de cerdo")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Mostrando 1 de 4 productos\./),
    ).toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Agotados" }));

    expect(within(tabla()).getByText("Chuleta de cerdo")).toBeInTheDocument();
    expect(within(tabla()).queryByText("Pollo a la brasa")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Inactivos" }));

    expect(within(tabla()).getByText("Producto viejo")).toBeInTheDocument();
    expect(within(tabla()).queryByText("Chuleta de cerdo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Temporada" }));

    expect(within(tabla()).getByText("Producto viejo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Todos" }));

    expect(within(tabla()).getByText("Pollo a la brasa")).toBeInTheDocument();
    expect(
      within(tabla()).getByText("Chuleta de cerdo"),
    ).toBeInTheDocument();
    expect(within(tabla()).getByText("Sangría de la casa")).toBeInTheDocument();
    expect(within(tabla()).getByText("Producto viejo")).toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: "no existe" } });

    expect(
      within(tabla()).getByText(
        "No hay productos que coincidan con la búsqueda o el filtro.",
      ),
    ).toBeInTheDocument();
  });

  it("crea un producto y refresca la tabla con lo que devolvió el servidor", async () => {
    const api = montar();
    await screen.findByText("Pollo a la brasa");

    const dialogo = await abrirNuevo();
    const categoria = within(dialogo).getByLabelText("Categoría");

    expect(
      within(categoria).queryByRole("option", { name: /Temporada/ }),
    ).not.toBeInTheDocument();

    llenarProducto(dialogo);
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Crear producto" }),
    );

    expect(
      await screen.findByText('Se creó "Costillas".'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Nuevo producto" }),
    ).not.toBeInTheDocument();

    expect(await within(tabla()).findByText("Costillas")).toBeInTheDocument();
    expect(within(tabla()).getByText("RD$ 495.50")).toBeInTheDocument();

    const creacion = api.peticiones.find(
      (peticion) =>
        peticion.metodo === "POST" &&
        peticion.url.endsWith("/api/productos"),
    );

    expect(creacion?.cuerpo).toEqual({
      nombre: "Costillas",
      precio: "495.50",
      id_categoria: 1,
      id_estacion: 1,
      tiempo_estimado_minutos: null,
    });
  });

  it("valida el formulario antes de llamar al servidor", async () => {
    const api = montar();
    await screen.findByText("Pollo a la brasa");

    const dialogo = await abrirNuevo();

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Crear producto" }),
    );

    expect(
      await screen.findByText("Escribe el nombre del producto."),
    ).toBeInTheDocument();
    expect(screen.getByText("Escribe el precio.")).toBeInTheDocument();
    expect(screen.getByText("Elige una categoría.")).toBeInTheDocument();
    expect(screen.getByText("Elige una estación.")).toBeInTheDocument();

    expect(
      api.peticiones.filter((peticion) => peticion.metodo === "POST"),
    ).toHaveLength(0);

    llenarProducto(dialogo, { nombre: "Producto con precio cero", precio: "0" });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Crear producto" }),
    );

    expect(
      await screen.findByText("El precio debe ser mayor que cero."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Escribe el precio.")).not.toBeInTheDocument();

    expect(
      api.peticiones.filter((peticion) => peticion.metodo === "POST"),
    ).toHaveLength(0);
  });

  it("muestra el error del servidor dentro de la ventana y no la cierra", async () => {
    const api = montar();
    await screen.findByText("Pollo a la brasa");

    const dialogo = await abrirNuevo();
    llenarProducto(dialogo);

    api.fallos.push({
      metodo: "POST",
      sufijo: "/api/productos",
      codigo: "NOMBRE_DUPLICADO",
      mensaje: "Ya hay un producto con ese nombre.",
    });

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Crear producto" }),
    );

    expect(
      await screen.findByText("Ya hay un producto con ese nombre."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Nuevo producto" }),
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByLabelText("Nombre"),
    ).toHaveValue("Costillas");
  });

  it("edita nombre, precio, categoría y estación, y refresca la fila", async () => {
    const api = montar();
    await screen.findByText("Pollo a la brasa");

    fireEvent.click(
      screen.getByRole("button", { name: "Editar Pollo a la brasa" }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Editar Pollo a la brasa",
    });

    expect(within(dialogo).getByLabelText("Nombre")).toHaveValue(
      "Pollo a la brasa",
    );
    expect(within(dialogo).getByLabelText("Precio")).toHaveValue("350.00");
    expect(dialogo).toHaveTextContent("Catálogo: Activo");
    expect(dialogo).toHaveTextContent("Disponibilidad: Disponible");

    llenarProducto(dialogo, {
      nombre: "Pollo a la brasa especial",
      precio: "375.25",
      categoria: "5",
      estacion: "3",
    });

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar cambios" }),
    );

    expect(
      await screen.findByText('Se actualizó "Pollo a la brasa especial".'),
    ).toBeInTheDocument();

    const edicion = api.peticiones.find(
      (peticion) =>
        peticion.metodo === "PATCH" &&
        peticion.url.endsWith("/api/productos/1"),
    );

    expect(edicion?.cuerpo).toEqual({
      nombre: "Pollo a la brasa especial",
      precio: "375.25",
      id_categoria: 5,
      id_estacion: 3,
      tiempo_estimado_minutos: null,
    });

    const fila = filaDe("Pollo a la brasa especial");
    expect(fila).toHaveTextContent("Parrilla");
    expect(fila).toHaveTextContent("RD$ 375.25");
    expect(within(tabla()).queryByText("Pollo a la brasa")).not.toBeInTheDocument();
  });

  it("al editar conserva la categoría inactiva actual y avisa por qué", async () => {
    montar();
    await screen.findByText("Producto viejo");

    fireEvent.click(
      screen.getByRole("button", { name: "Editar Producto viejo" }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Editar Producto viejo",
    });

    expect(dialogo).toHaveTextContent("Catálogo: Inactivo");
    expect(dialogo).toHaveTextContent("Disponibilidad: Disponible");
    expect(within(dialogo).getByLabelText("Categoría")).toHaveValue("3");
    expect(
      within(dialogo).getByRole("option", {
        name: "Temporada (inactiva)",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByText(/Esta categoría está inactiva/),
    ).toBeInTheDocument();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByRole("dialog", { name: "Editar Producto viejo" }),
    ).not.toBeInTheDocument();
  });

  it("cambia la disponibilidad sin pedir confirmación", async () => {
    const api = montar();
    await screen.findByText("Pollo a la brasa");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Marcar como agotado: Pollo a la brasa",
      }),
    );

    expect(
      await screen.findByText('"Pollo a la brasa" quedó agotado.'),
    ).toBeInTheDocument();

    expect(filaDe("Pollo a la brasa")).toHaveTextContent("Agotado");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Marcar como disponible: Pollo a la brasa",
      }),
    );

    expect(
      await screen.findByText('"Pollo a la brasa" quedó disponible.'),
    ).toBeInTheDocument();
    expect(filaDe("Pollo a la brasa")).toHaveTextContent("Disponible");

    const cambios = api.peticiones.filter(
      (peticion) =>
        peticion.metodo === "PATCH" &&
        peticion.url.endsWith("/api/productos/1/disponibilidad"),
    );

    expect(cambios.map((peticion) => peticion.cuerpo)).toEqual([
      { disponible: false },
      { disponible: true },
    ]);
  });

  it("da de baja y reactiva sin perder la disponibilidad", async () => {
    const api = montar();
    await screen.findByText("Chuleta de cerdo");

    fireEvent.click(
      screen.getByRole("button", { name: "Dar de baja Chuleta de cerdo" }),
    );

    const dialogoBaja = await screen.findByRole("dialog", {
      name: "Dar de baja Chuleta de cerdo",
    });

    expect(dialogoBaja).toHaveTextContent(/No se borra/);

    fireEvent.click(
      within(dialogoBaja).getByRole("button", { name: "Dar de baja" }),
    );

    expect(
      await screen.findByText(/"Chuleta de cerdo" salió del catálogo/),
    ).toBeInTheDocument();

    expect(filaDe("Chuleta de cerdo")).toHaveTextContent("Inactivo");
    expect(filaDe("Chuleta de cerdo")).toHaveTextContent("Agotado");

    const baja = api.peticiones.find(
      (peticion) =>
        peticion.metodo === "POST" &&
        peticion.url.endsWith("/api/productos/2/baja"),
    );

    expect(baja).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Reactivar Chuleta de cerdo" }),
    ).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Reactivar Chuleta de cerdo" }),
    );

    const dialogoVuelta = await screen.findByRole("dialog", {
      name: "Reactivar Chuleta de cerdo",
    });

    expect(dialogoVuelta).toHaveTextContent(
      "Volverá al catálogo con la disponibilidad que tenía: Agotado.",
    );

    fireEvent.click(
      within(dialogoVuelta).getByRole("button", { name: "Reactivar" }),
    );

    expect(
      await screen.findByText(/volvió al catálogo y quedó agotado/),
    ).toBeInTheDocument();

    expect(filaDe("Chuleta de cerdo")).toHaveTextContent("Activo");
    expect(filaDe("Chuleta de cerdo")).toHaveTextContent("Agotado");
  });

  it("si la baja falla, deja la confirmación abierta con el mensaje", async () => {
    const api = montar();
    await screen.findByText("Pollo a la brasa");

    api.fallos.push({
      metodo: "POST",
      sufijo: "/baja",
      codigo: "PRODUCTO_YA_INACTIVO",
      mensaje: "Ese producto ya está fuera del catálogo.",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Dar de baja Pollo a la brasa" }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Dar de baja Pollo a la brasa",
    });

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Dar de baja" }),
    );

    expect(
      await screen.findByText("Ese producto ya está fuera del catálogo."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Dar de baja Pollo a la brasa" }),
    ).toBeInTheDocument();
    expect(filaDe("Pollo a la brasa")).toHaveTextContent("Activo");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByRole("dialog", { name: "Dar de baja Pollo a la brasa" }),
    ).not.toBeInTheDocument();
  });

  it("sin categorías ni estaciones no deja crear, pero sí preparar el catálogo", async () => {
    montar(DATOS_VACIOS);

    await screen.findByRole("heading", { name: "Productos y catálogo" });

    expect(
      screen.getByText("Todavía no hay productos. Crea el primero con «Nuevo producto»."),
    ).toBeInTheDocument();
    expect(screen.getByText("Falta preparar el catálogo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nuevo producto" }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Categorías y estaciones" }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Categorías y estaciones",
    });

    expect(
      within(dialogo).getByText("Todavía no hay categorías."),
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByText("Todavía no hay estaciones."),
    ).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText("Nueva categoría"), {
      target: { value: "Bebidas" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Agregar categoría" }),
    );

    expect(
      await within(dialogo).findByText('Se creó la categoría "Bebidas".'),
    ).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText("Nueva estación"), {
      target: { value: "Barra" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Agregar estación" }),
    );

    expect(
      await within(dialogo).findByText('Se creó la estación "Barra".'),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Cerrar ventana" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Categorías y estaciones" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Nuevo producto" }),
    ).toBeEnabled();
  });

  it("crea, renombra y activa/desactiva categorías y estaciones", async () => {
    const api = montar();
    await screen.findByText("Pollo a la brasa");

    fireEvent.click(
      screen.getByRole("button", { name: "Categorías y estaciones" }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Categorías y estaciones",
    });

    expect(within(dialogo).getByText("Platos fuertes")).toBeInTheDocument();
    expect(within(dialogo).getByText("Temporada")).toBeInTheDocument();
    expect(within(dialogo).getByText("Cocina")).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText("Nueva categoría"), {
      target: { value: "Cafés" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Agregar categoría" }),
    );

    expect(
      await within(dialogo).findByText('Se creó la categoría "Cafés".'),
    ).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText("Nueva estación"), {
      target: { value: "Caja" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Agregar estación" }),
    );

    expect(
      await within(dialogo).findByText('Se creó la estación "Caja".'),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialogo).getByRole("button", {
        name: "Renombrar la categoría Cafés",
      }),
    );

    const campoCategoria = within(dialogo).getByLabelText(
      'Nuevo nombre de la categoría "Cafés"',
    );

    fireEvent.change(campoCategoria, { target: { value: "Cafetería" } });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar" }),
    );

    expect(
      await within(dialogo).findByText(
        'La categoría ahora se llama "Cafetería".',
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialogo).getByRole("button", {
        name: "Renombrar la estación Caja",
      }),
    );

    const campoEstacion = within(dialogo).getByLabelText(
      'Nuevo nombre de la estación "Caja"',
    );

    fireEvent.change(campoEstacion, {
      target: { value: "Caja principal" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar" }),
    );

    expect(
      await within(dialogo).findByText(
        'La estación ahora se llama "Caja principal".',
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialogo).getByRole("button", {
        name: "Desactivar la categoría Postres",
      }),
    );

    expect(
      await within(dialogo).findByText(
        'Se desactivó la categoría "Postres".',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByRole("button", {
        name: "Activar la categoría Postres",
      }),
    ).toBeInTheDocument();

    api.fallos.push({
      metodo: "PATCH",
      sufijo: "/api/productos/categorias/1",
      codigo: "CATEGORIA_CON_PRODUCTOS_ACTIVOS",
      mensaje:
        "No puedes desactivar una categoría que todavía tiene productos activos.",
    });

    fireEvent.click(
      within(dialogo).getByRole("button", {
        name: "Desactivar la categoría Platos fuertes",
      }),
    );

    expect(
      await within(dialogo).findByText(
        "No puedes desactivar una categoría que todavía tiene productos activos.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByRole("button", {
        name: "Desactivar la categoría Platos fuertes",
      }),
    ).toBeInTheDocument();

    expect(
      api.datos().categorias.find(
        (categoria) => categoria.id_categoria === 6,
      )?.nombre,
    ).toBe("Cafetería");
    expect(
      api.datos().estaciones.find(
        (estacion) => estacion.id_estacion === 4,
      )?.nombre,
    ).toBe("Caja principal");
  });

  it("si la carga falla, muestra el error y se puede reintentar", async () => {
    let intentos = 0;

    simularFetch((url, inicio) => {
      if (
        url.endsWith("/api/productos") &&
        (inicio?.method ?? "GET") === "GET"
      ) {
        intentos += 1;

        if (intentos === 1) {
          return respuestaDeError(
            "ERROR_INTERNO",
            "El servidor no pudo cargar el catálogo.",
            500,
          );
        }

        return respuestaDeExito(DATOS);
      }

      return respuestaDeError("NO_ENCONTRADO", "Ruta no preparada.", 404);
    });

    montarConSesion(<Productos />, {
      sesion: sesionFalsa({ permisos: PERMISOS_DEL_GERENTE }),
    });

    expect(
      await screen.findByText("El servidor no pudo cargar el catálogo."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Productos y catálogo" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Pollo a la brasa")).toBeInTheDocument();
  });
});
