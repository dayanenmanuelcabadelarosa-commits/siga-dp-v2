/*
  Personal.test.tsx — la pantalla de Personal y usuarios, con la API sustituida.
  ------------------------------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que el servidor responde:

    · La lista se dibuja con sus estados y con las acciones que aplican.
    · Si la carga falla, se muestra el error y se puede reintentar.
    · Crear manda el cuerpo completo y cierra la ventana.
    · Un error del servidor se queda dentro de la ventana, con su mensaje.
    · Editar manda un PATCH y no deja tocar la cédula.
    · Dar de baja, reactivar y desbloquear piden confirmación y refrescan.
    · Cambiar la clave exige 8 caracteres y usa el mensaje del servidor.
    · Las filas de nivel superior al de la persona quedan deshabilitadas.

  Que la base guarde de verdad lo comprueban las pruebas del servidor. Aquí se
  simula el cable, no la base.
*/

import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  EmpleadoDePersonal,
  RolAsignable,
} from "../../src/api/personal";
import { Personal } from "../../src/paginas/Personal";
import { guardarSesion } from "../../src/sesion/almacen";
import {
  URL_DE_PRUEBA,
  respuestaDeError,
  respuestaDeExito,
  simularFetch,
} from "../ayudas/api-falsa";
import {
  PERMISOS_DEL_GERENTE,
  USUARIO_DE_PRUEBA,
  montarConSesion,
  sesionFalsa,
} from "../ayudas/sesion-de-prueba";
import type { UsuarioDeSesion } from "../../src/api/tipos";

const ROLES: RolAsignable[] = [
  {
    id_rol: 2,
    codigo: "gerente",
    nombre: "Gerente",
    nivel: 4,
    descripcion: null,
  },
  {
    id_rol: 4,
    codigo: "mesero",
    nombre: "Mesero",
    nivel: 2,
    descripcion: null,
  },
];

const GERENTE: EmpleadoDePersonal = {
  id_empleado: 1,
  cedula: "001-0000001-1",
  nombre: "Ana Pérez",
  telefono: "809-555-0100",
  fecha_ingreso: "2026-01-15",
  id_rol: 2,
  rol: "gerente",
  rol_nombre: "Gerente",
  nivel: 5,
  id_usuario: 1,
  usuario: "gerente",
  estado: "Activo",
  estado_empleado: "Activo",
  estado_usuario: "Activo",
  intentos_fallidos: 0,
  ultimo_acceso: null,
};

const MESERO: EmpleadoDePersonal = {
  id_empleado: 8,
  cedula: "001-0000008-1",
  nombre: "Luis Gómez",
  telefono: "809-555-0101",
  fecha_ingreso: "2026-02-01",
  id_rol: 4,
  rol: "mesero",
  rol_nombre: "Mesero",
  nivel: 2,
  id_usuario: 8,
  usuario: "lgomez",
  estado: "Activo",
  estado_empleado: "Activo",
  estado_usuario: "Activo",
  intentos_fallidos: 0,
  ultimo_acceso: null,
};

const BLOQUEADO: EmpleadoDePersonal = {
  ...MESERO,
  id_empleado: 9,
  id_usuario: 9,
  nombre: "Carlos Díaz",
  usuario: "cdiaz",
  estado: "Bloqueado",
  estado_usuario: "Bloqueado",
  intentos_fallidos: 3,
};

const SIN_CUENTA: EmpleadoDePersonal = {
  ...MESERO,
  id_empleado: 10,
  id_usuario: null,
  nombre: "Rosa Núñez",
  usuario: null,
  estado: "Activo",
  estado_usuario: null,
  intentos_fallidos: null,
};

const DUENO: EmpleadoDePersonal = {
  ...GERENTE,
  id_empleado: 5,
  id_usuario: 5,
  nombre: "Doña Rosa Pula",
  usuario: "dueno",
  id_rol: 1,
  rol: "dueno",
  rol_nombre: "Dueño",
  nivel: 5,
};

interface Peticion {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

/** Saca un texto de un cuerpo JSON sin confiar en que sea un texto. */
function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

/**
 * Una API de mentira que se acuerda de la lista: después de una baja o una
 * reactivación, el siguiente GET devuelve el estado nuevo, como el servidor.
 */
function apiDePersonal(iniciales: readonly EmpleadoDePersonal[]) {
  let empleados = [...iniciales];
  const peticiones: Peticion[] = [];

  function nombreDe(id: number): string {
    return empleados.find((fila) => fila.id_empleado === id)?.nombre ?? "la persona";
  }

  function actualizar(
    id: number,
    cambios: Partial<EmpleadoDePersonal>,
  ): EmpleadoDePersonal | null {
    empleados = empleados.map((fila) =>
      fila.id_empleado === id ? { ...fila, ...cambios } : fila,
    );

    return empleados.find((fila) => fila.id_empleado === id) ?? null;
  }

  function manejador(url: string, inicio?: RequestInit): Response {
    const metodo = inicio?.method ?? "GET";
    const cuerpo =
      typeof inicio?.body === "string"
        ? (JSON.parse(inicio.body) as Record<string, unknown>)
        : null;

    peticiones.push({ url, metodo, cuerpo });

    if (url.endsWith("/api/personal") && metodo === "GET") {
      return respuestaDeExito({ empleados, roles: ROLES });
    }

    if (url.endsWith("/api/personal") && metodo === "POST") {
      const telefono =
        typeof cuerpo?.telefono === "string" && cuerpo.telefono !== ""
          ? cuerpo.telefono
          : null;

      const nuevo: EmpleadoDePersonal = {
        ...MESERO,
        id_empleado: 100,
        id_usuario: 100,
        cedula: texto(cuerpo?.cedula),
        nombre: texto(cuerpo?.nombre),
        telefono,
        usuario: texto(cuerpo?.usuario).toLowerCase(),
        id_rol: Number(cuerpo?.id_rol ?? 4),
        estado: "Activo",
        estado_empleado: "Activo",
        estado_usuario: "Activo",
        intentos_fallidos: 0,
      };

      empleados = [...empleados, nuevo];

      return respuestaDeExito(nuevo, 201);
    }

    const accion = /\/api\/personal\/(\d+)\/(baja|reactivar|desbloquear|clave)$/.exec(
      url,
    );

    if (accion !== null) {
      const id = Number(accion[1]);
      const tipo = accion[2];

      if (tipo === "clave") {
        return respuestaDeExito({
          mensaje: `La clave de ${nombreDe(id)} quedó actualizada.`,
        });
      }

      const nuevoEstado = tipo === "baja" ? "Inactivo" : "Activo";
      const actualizado = actualizar(id, {
        estado: nuevoEstado,
        estado_empleado: nuevoEstado,
        estado_usuario: nuevoEstado,
        intentos_fallidos: 0,
      });

      return actualizado === null
        ? respuestaDeError("NO_ENCONTRADO", "Ese empleado no existe.", 404)
        : respuestaDeExito(actualizado);
    }

    const edicion = /\/api\/personal\/(\d+)$/.exec(url);

    if (edicion !== null && metodo === "PATCH") {
      const id = Number(edicion[1]);
      const idRol = Number(cuerpo?.id_rol ?? 0);
      const rol = ROLES.find((candidato) => candidato.id_rol === idRol);
      const telefono =
        typeof cuerpo?.telefono === "string" && cuerpo.telefono !== ""
          ? cuerpo.telefono
          : null;

      const actualizado = actualizar(id, {
        nombre: texto(cuerpo?.nombre),
        telefono,
        id_rol: idRol,
        rol: rol?.codigo ?? "mesero",
        rol_nombre: rol?.nombre ?? "Mesero",
        nivel: rol?.nivel ?? 2,
      });

      return actualizado === null
        ? respuestaDeError("NO_ENCONTRADO", "Ese empleado no existe.", 404)
        : respuestaDeExito(actualizado);
    }

    return respuestaDeError("NO_ENCONTRADO", "Esa ruta no existe.", 404);
  }

  return { manejador, peticiones };
}

function montar(usuario: UsuarioDeSesion = USUARIO_DE_PRUEBA) {
  return montarConSesion(<Personal />, {
    sesion: sesionFalsa({
      permisos: PERMISOS_DEL_GERENTE,
      usuario,
    }),
  });
}

function llenarFormularioNuevo(
  valores: {
    cedula?: string;
    nombre?: string;
    telefono?: string;
    rol?: string;
    usuario?: string;
    clave?: string;
  } = {},
): void {
  fireEvent.change(screen.getByLabelText("Cédula"), {
    target: { value: valores.cedula ?? "001-0000011-1" },
  });
  fireEvent.change(screen.getByLabelText("Nombre completo"), {
    target: { value: valores.nombre ?? "Empleada Nueva" },
  });
  fireEvent.change(screen.getByLabelText("Teléfono"), {
    target: { value: valores.telefono ?? "809-555-0111" },
  });
  fireEvent.change(screen.getByLabelText("Rol"), {
    target: { value: valores.rol ?? "4" },
  });
  fireEvent.change(screen.getByLabelText("Usuario"), {
    target: { value: valores.usuario ?? "enueva" },
  });
  fireEvent.change(screen.getByLabelText("Clave inicial"), {
    target: { value: valores.clave ?? "clave-nueva-123" },
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

describe("Personal", () => {
  it("muestra la lista con sus estados y acciones", async () => {
    simularFetch(
      apiDePersonal([GERENTE, MESERO, BLOQUEADO, SIN_CUENTA]).manejador,
    );

    montar();

    expect(
      await screen.findByRole("heading", { name: "Personal y usuarios" }),
    ).toBeInTheDocument();

    const tabla = await screen.findByRole("table", {
      name: "Personal registrado",
    });

    expect(within(tabla).getByText("Luis Gómez")).toBeInTheDocument();
    expect(within(tabla).getByText("lgomez")).toBeInTheDocument();
    expect(within(tabla).getByText("Carlos Díaz")).toBeInTheDocument();
    expect(within(tabla).getByText("3 intentos fallidos")).toBeInTheDocument();
    expect(within(tabla).getByText("Sin cuenta")).toBeInTheDocument();
    expect(screen.getByText(/4 empleados registrados/)).toBeInTheDocument();

    // La propia persona no puede darse de baja; el mesero sí.
    expect(
      within(tabla).getByRole("button", { name: "Dar de baja a Ana Pérez" }),
    ).toBeDisabled();
    expect(
      within(tabla).getByRole("button", { name: "Dar de baja a Luis Gómez" }),
    ).toBeEnabled();

    // Una cuenta bloqueada ofrece desbloquear; una sin cuenta no ofrece clave.
    expect(
      within(tabla).getByRole("button", {
        name: "Desbloquear la cuenta de Carlos Díaz",
      }),
    ).toBeInTheDocument();
    expect(
      within(tabla).queryByRole("button", {
        name: "Cambiar la clave de Rosa Núñez",
      }),
    ).not.toBeInTheDocument();
  });

  it("si la carga falla, muestra el error y deja reintentar", async () => {
    let intentos = 0;

    simularFetch(() => {
      intentos += 1;

      return intentos === 1
        ? respuestaDeError(
            "SIN_CONEXION",
            "No se pudo contactar al servidor.",
            503,
          )
        : respuestaDeExito({ empleados: [MESERO], roles: ROLES });
    });

    montar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo contactar al servidor.",
    );
    expect(
      screen.getByRole("heading", { name: "Personal y usuarios" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Luis Gómez")).toBeInTheDocument();
  });

  it("crea un empleado y refresca la lista con lo que devolvió el servidor", async () => {
    const api = apiDePersonal([GERENTE, MESERO]);
    simularFetch(api.manejador);

    montar();
    await screen.findByText("Luis Gómez");

    fireEvent.click(screen.getByRole("button", { name: "Nuevo empleado" }));

    expect(
      await screen.findByRole("dialog", { name: "Nuevo empleado" }),
    ).toBeInTheDocument();

    llenarFormularioNuevo();
    fireEvent.click(screen.getByRole("button", { name: "Crear empleado" }));

    expect(
      await screen.findByText(
        /Se creó a Empleada Nueva con el usuario enueva/,
      ),
    ).toBeInTheDocument();

    const tabla = screen.getByRole("table", { name: "Personal registrado" });
    expect(
      await within(tabla).findByText("Empleada Nueva"),
    ).toBeInTheDocument();

    const creacion = api.peticiones.find(
      (peticion) =>
        peticion.url.endsWith("/api/personal") && peticion.metodo === "POST",
    );

    expect(creacion?.cuerpo).toEqual({
      cedula: "001-0000011-1",
      nombre: "Empleada Nueva",
      telefono: "809-555-0111",
      id_rol: 4,
      usuario: "enueva",
      clave: "clave-nueva-123",
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si el servidor rechaza el alta, el mensaje se queda en la ventana", async () => {
    const api = apiDePersonal([GERENTE]);

    simularFetch((url, inicio) => {
      if (url.endsWith("/api/personal") && inicio?.method === "POST") {
        return respuestaDeError(
          "USUARIO_DUPLICADO",
          "Ese nombre de usuario ya está ocupado. Elige otro.",
          409,
        );
      }

      return api.manejador(url, inicio);
    });

    montar();
    await screen.findByText("Ana Pérez");

    fireEvent.click(screen.getByRole("button", { name: "Nuevo empleado" }));
    await screen.findByRole("dialog", { name: "Nuevo empleado" });

    llenarFormularioNuevo();
    fireEvent.click(screen.getByRole("button", { name: "Crear empleado" }));

    expect(
      await screen.findByText(
        "Ese nombre de usuario ya está ocupado. Elige otro.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("dialog", { name: "Nuevo empleado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crear empleado" }),
    ).toBeEnabled();
    expect(screen.queryByText(/Se creó a/)).not.toBeInTheDocument();
  });

  it("valida en el cliente antes de gastar una petición", async () => {
    const api = apiDePersonal([GERENTE]);
    simularFetch(api.manejador);

    montar();
    await screen.findByText("Ana Pérez");

    fireEvent.click(screen.getByRole("button", { name: "Nuevo empleado" }));
    await screen.findByRole("dialog", { name: "Nuevo empleado" });

    fireEvent.click(screen.getByRole("button", { name: "Crear empleado" }));

    expect(await screen.findByText("Escribe la cédula.")).toBeInTheDocument();
    expect(
      api.peticiones.filter((peticion) => peticion.metodo === "POST"),
    ).toHaveLength(0);
  });

  it("edita nombre, teléfono y rol, sin tocar la cédula", async () => {
    const api = apiDePersonal([GERENTE, MESERO]);
    simularFetch(api.manejador);

    montar();
    await screen.findByText("Luis Gómez");

    fireEvent.click(
      screen.getByRole("button", { name: "Editar a Luis Gómez" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Editar a Luis Gómez" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cédula")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Luis Gómez Pérez" },
    });
    fireEvent.change(screen.getByLabelText("Rol"), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("Se actualizó a Luis Gómez Pérez."),
    ).toBeInTheDocument();

    const edicion = api.peticiones.find(
      (peticion) => peticion.metodo === "PATCH",
    );

    expect(edicion?.url).toBe(`${URL_DE_PRUEBA}/api/personal/8`);
    expect(edicion?.cuerpo).toEqual({
      nombre: "Luis Gómez Pérez",
      telefono: "809-555-0101",
      id_rol: 2,
    });

    const tabla = screen.getByRole("table", { name: "Personal registrado" });
    expect(
      await within(tabla).findByText("Luis Gómez Pérez"),
    ).toBeInTheDocument();
  });

  it("da de baja y reactiva a la misma persona", async () => {
    const api = apiDePersonal([GERENTE, MESERO]);
    simularFetch(api.manejador);

    montar();
    await screen.findByText("Luis Gómez");

    fireEvent.click(
      screen.getByRole("button", { name: "Dar de baja a Luis Gómez" }),
    );

    const dialogoBaja = await screen.findByRole("dialog", {
      name: "Dar de baja a Luis Gómez",
    });
    expect(within(dialogoBaja).getByText(/no podrá entrar/)).toBeInTheDocument();

    fireEvent.click(
      within(dialogoBaja).getByRole("button", { name: "Dar de baja" }),
    );

    expect(
      await screen.findByText(/Luis Gómez quedó dado de baja/),
    ).toBeInTheDocument();

    let tabla = screen.getByRole("table", { name: "Personal registrado" });
    expect(await within(tabla).findByText("Inactivo")).toBeInTheDocument();

    const baja = api.peticiones.find((peticion) =>
      peticion.url.endsWith("/baja"),
    );
    expect(baja?.metodo).toBe("POST");
    expect(baja?.url).toBe(`${URL_DE_PRUEBA}/api/personal/8/baja`);

    fireEvent.click(
      within(tabla).getByRole("button", {
        name: "Reactivar a Luis Gómez",
      }),
    );

    const dialogoReactivar = await screen.findByRole("dialog", {
      name: "Reactivar a Luis Gómez",
    });
    fireEvent.click(
      within(dialogoReactivar).getByRole("button", { name: "Reactivar" }),
    );

    expect(
      await screen.findByText(/Luis Gómez quedó activo otra vez/),
    ).toBeInTheDocument();

    tabla = screen.getByRole("table", { name: "Personal registrado" });
    expect(await within(tabla).findAllByText("Activo")).toHaveLength(2);

    const reactivacion = api.peticiones.find((peticion) =>
      peticion.url.endsWith("/reactivar"),
    );
    expect(reactivacion?.url).toBe(
      `${URL_DE_PRUEBA}/api/personal/8/reactivar`,
    );
  });

  it("desbloquea una cuenta bloqueada y limpia los intentos", async () => {
    const api = apiDePersonal([GERENTE, BLOQUEADO]);
    simularFetch(api.manejador);

    montar();
    expect(await screen.findByText("3 intentos fallidos")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Desbloquear la cuenta de Carlos Díaz",
      }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Desbloquear la cuenta de Carlos Díaz",
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Desbloquear" }),
    );

    expect(
      await screen.findByText(/La cuenta de Carlos Díaz quedó desbloqueada/),
    ).toBeInTheDocument();

    const tabla = screen.getByRole("table", { name: "Personal registrado" });
    expect(await within(tabla).findAllByText("Activo")).toHaveLength(2);
    expect(
      within(tabla).queryByText("3 intentos fallidos"),
    ).not.toBeInTheDocument();

    const desbloqueo = api.peticiones.find((peticion) =>
      peticion.url.endsWith("/desbloquear"),
    );
    expect(desbloqueo?.url).toBe(
      `${URL_DE_PRUEBA}/api/personal/9/desbloquear`,
    );
  });

  it("cambia la clave: exige 8 caracteres y muestra el mensaje del servidor", async () => {
    const api = apiDePersonal([GERENTE, MESERO]);
    simularFetch(api.manejador);

    montar();
    await screen.findByText("Luis Gómez");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cambiar la clave de Luis Gómez",
      }),
    );

    const dialogo = await screen.findByRole("dialog", {
      name: "Cambiar la clave de Luis Gómez",
    });

    fireEvent.change(within(dialogo).getByLabelText("Clave nueva"), {
      target: { value: "corta" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar clave" }),
    );

    expect(
      await screen.findByText("La clave debe tener al menos 8 caracteres."),
    ).toBeInTheDocument();
    expect(
      api.peticiones.filter((peticion) =>
        peticion.url.endsWith("/clave"),
      ),
    ).toHaveLength(0);

    fireEvent.change(within(dialogo).getByLabelText("Clave nueva"), {
      target: { value: "clave-nueva-123" },
    });
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar clave" }),
    );

    expect(
      await screen.findByText("La clave de Luis Gómez quedó actualizada."),
    ).toBeInTheDocument();

    const cambio = api.peticiones.find((peticion) =>
      peticion.url.endsWith("/clave"),
    );
    expect(cambio?.url).toBe(`${URL_DE_PRUEBA}/api/personal/8/clave`);
    expect(cambio?.cuerpo).toEqual({ clave: "clave-nueva-123" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deshabilita las acciones sobre alguien de nivel superior", async () => {
    const api = apiDePersonal([DUENO, MESERO]);
    simularFetch(api.manejador);

    montar({ ...USUARIO_DE_PRUEBA, nivel: 4 });
    await screen.findByText("Doña Rosa Pula");

    const tabla = screen.getByRole("table", { name: "Personal registrado" });

    expect(
      within(tabla).getByRole("button", { name: "Editar a Doña Rosa Pula" }),
    ).toBeDisabled();
    expect(
      within(tabla).getByRole("button", {
        name: "Dar de baja a Doña Rosa Pula",
      }),
    ).toBeDisabled();

    // Al mesero, que es de nivel menor, sí se le puede administrar.
    expect(
      within(tabla).getByRole("button", { name: "Editar a Luis Gómez" }),
    ).toBeEnabled();
  });
});
