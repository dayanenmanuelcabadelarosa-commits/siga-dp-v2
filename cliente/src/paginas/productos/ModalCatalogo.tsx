/*
  ModalCatalogo.tsx — administrar las categorías y las estaciones.
  --------------------------------------------------------------

  Las categorías y las estaciones son datos del negocio, no listas escritas en el
  código. Aquí se crean y se renombran; las categorías también se activan y se
  desactivan. Una categoría con productos activos no se puede desactivar: el
  servidor lo impide y aquí se muestra su mensaje.

  Las estaciones no tienen estado activo/inactivo ni se borran. Renombrarlas es
  seguro porque las comandas y los productos guardan el id, no el nombre.
*/

import { Pencil, Plus, PowerOff, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import {
  crearCategoria,
  crearEstacion,
  editarCategoria,
  editarEstacion,
} from "../../api/productos";
import type { Categoria, Estacion } from "../../api/productos";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Insignia } from "../../componentes/Insignia";
import { Modal } from "../../componentes/Modal";

export interface ModalCatalogoProps {
  categorias: readonly Categoria[];
  estaciones: readonly Estacion[];
  alCerrar: () => void;
  /** Vuelve a pedir la lista para que la tabla vea los nombres nuevos. */
  alRefrescar: () => Promise<void>;
}

function ordenarCategorias(lista: readonly Categoria[]): Categoria[] {
  return [...lista].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

function ordenarEstaciones(lista: readonly Estacion[]): Estacion[] {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function ModalCatalogo({
  categorias,
  estaciones,
  alCerrar,
  alRefrescar,
}: ModalCatalogoProps) {
  const [categoriasLocales, setCategoriasLocales] = useState<Categoria[]>(() =>
    ordenarCategorias(categorias),
  );
  const [estacionesLocales, setEstacionesLocales] = useState<Estacion[]>(() =>
    ordenarEstaciones(estaciones),
  );

  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [nuevaEstacion, setNuevaEstacion] = useState("");
  const [errorNuevaCategoria, setErrorNuevaCategoria] = useState<string | null>(
    null,
  );
  const [errorNuevaEstacion, setErrorNuevaEstacion] = useState<string | null>(
    null,
  );

  const [editandoCategoria, setEditandoCategoria] = useState<number | null>(
    null,
  );
  const [nombreCategoriaEditada, setNombreCategoriaEditada] = useState("");
  const [errorCategoriaEditada, setErrorCategoriaEditada] = useState<
    string | null
  >(null);

  const [editandoEstacion, setEditandoEstacion] = useState<number | null>(null);
  const [nombreEstacionEditada, setNombreEstacionEditada] = useState("");
  const [errorEstacionEditada, setErrorEstacionEditada] = useState<
    string | null
  >(null);

  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);

  const ocupado = accionEnCurso !== null;

  async function ejecutar(
    clave: string,
    trabajo: () => Promise<void>,
  ): Promise<void> {
    setAccionEnCurso(clave);
    setError(null);
    setAviso(null);

    try {
      await trabajo();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setAccionEnCurso(null);
    }
  }

  function agregarCategoria(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    const nombre = nuevaCategoria.trim();

    if (nombre === "") {
      setErrorNuevaCategoria("Escribe el nombre de la categoría.");
      return;
    }

    if (nombre.length > 50) {
      setErrorNuevaCategoria(
        "El nombre de la categoría no puede pasar de 50 caracteres.",
      );
      return;
    }

    setErrorNuevaCategoria(null);

    void ejecutar("crear-categoria", async () => {
      const creada = await crearCategoria(nombre);
      setCategoriasLocales((actuales) =>
        ordenarCategorias([...actuales, creada]),
      );
      setNuevaCategoria("");
      setAviso(`Se creó la categoría "${creada.nombre}".`);
      await alRefrescar();
    });
  }

  function agregarEstacion(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    const nombre = nuevaEstacion.trim();

    if (nombre === "") {
      setErrorNuevaEstacion("Escribe el nombre de la estación.");
      return;
    }

    if (nombre.length > 30) {
      setErrorNuevaEstacion(
        "El nombre de la estación no puede pasar de 30 caracteres.",
      );
      return;
    }

    setErrorNuevaEstacion(null);

    void ejecutar("crear-estacion", async () => {
      const creada = await crearEstacion(nombre);
      setEstacionesLocales((actuales) =>
        ordenarEstaciones([...actuales, creada]),
      );
      setNuevaEstacion("");
      setAviso(`Se creó la estación "${creada.nombre}".`);
      await alRefrescar();
    });
  }

  function comenzarRenombreCategoria(categoria: Categoria): void {
    setEditandoCategoria(categoria.id_categoria);
    setNombreCategoriaEditada(categoria.nombre);
    setErrorCategoriaEditada(null);
    setError(null);
    setAviso(null);
  }

  function guardarRenombreCategoria(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    if (editandoCategoria === null) return;

    const categoria = categoriasLocales.find(
      (fila) => fila.id_categoria === editandoCategoria,
    );
    if (categoria === undefined) return;

    const nombre = nombreCategoriaEditada.trim();

    if (nombre === "") {
      setErrorCategoriaEditada("Escribe el nombre de la categoría.");
      return;
    }

    if (nombre.length > 50) {
      setErrorCategoriaEditada(
        "El nombre de la categoría no puede pasar de 50 caracteres.",
      );
      return;
    }

    setErrorCategoriaEditada(null);

    void ejecutar(`categoria:${categoria.id_categoria}:nombre`, async () => {
      const actualizada = await editarCategoria(categoria.id_categoria, {
        nombre,
      });

      setCategoriasLocales((actuales) =>
        ordenarCategorias(
          actuales.map((fila) =>
            fila.id_categoria === actualizada.id_categoria
              ? actualizada
              : fila,
          ),
        ),
      );
      setEditandoCategoria(null);
      setAviso(`La categoría ahora se llama "${actualizada.nombre}".`);
      await alRefrescar();
    });
  }

  function cambiarActivoCategoria(categoria: Categoria): void {
    void ejecutar(`categoria:${categoria.id_categoria}:activo`, async () => {
      const actualizada = await editarCategoria(categoria.id_categoria, {
        activo: !categoria.activo,
      });

      setCategoriasLocales((actuales) =>
        ordenarCategorias(
          actuales.map((fila) =>
            fila.id_categoria === actualizada.id_categoria
              ? actualizada
              : fila,
          ),
        ),
      );
      setAviso(
        actualizada.activo
          ? `Se activó la categoría "${actualizada.nombre}".`
          : `Se desactivó la categoría "${actualizada.nombre}".`,
      );
      await alRefrescar();
    });
  }

  function comenzarRenombreEstacion(estacion: Estacion): void {
    setEditandoEstacion(estacion.id_estacion);
    setNombreEstacionEditada(estacion.nombre);
    setErrorEstacionEditada(null);
    setError(null);
    setAviso(null);
  }

  function guardarRenombreEstacion(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    if (editandoEstacion === null) return;

    const estacion = estacionesLocales.find(
      (fila) => fila.id_estacion === editandoEstacion,
    );
    if (estacion === undefined) return;

    const nombre = nombreEstacionEditada.trim();

    if (nombre === "") {
      setErrorEstacionEditada("Escribe el nombre de la estación.");
      return;
    }

    if (nombre.length > 30) {
      setErrorEstacionEditada(
        "El nombre de la estación no puede pasar de 30 caracteres.",
      );
      return;
    }

    setErrorEstacionEditada(null);

    void ejecutar(`estacion:${estacion.id_estacion}:nombre`, async () => {
      const actualizada = await editarEstacion(estacion.id_estacion, {
        nombre,
      });

      setEstacionesLocales((actuales) =>
        ordenarEstaciones(
          actuales.map((fila) =>
            fila.id_estacion === actualizada.id_estacion ? actualizada : fila,
          ),
        ),
      );
      setEditandoEstacion(null);
      setAviso(`La estación ahora se llama "${actualizada.nombre}".`);
      await alRefrescar();
    });
  }

  return (
    <Modal
      titulo="Categorías y estaciones"
      alCerrar={alCerrar}
      ancho="ancho"
      cerrable={!ocupado}
    >
      <div className="space-y-5">
        <p className="text-sm text-madera">
          Las categorías y las estaciones se guardan en la base. No son listas
          fijas del programa: lo que agregues aquí aparece en el formulario de
          productos.
        </p>

        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo completar">
            {error}
          </Alerta>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <section
            aria-labelledby="titulo-categorias"
            className="rounded-2xl border border-madera/10 bg-crema/40 p-4"
          >
            <h3
              id="titulo-categorias"
              className="text-base font-semibold text-carbon"
            >
              Categorías
            </h3>
            <p className="mt-1 text-xs text-madera">
              Una categoría con productos activos no se puede desactivar.
              Primero da de baja esos productos o cámbialos de categoría.
            </p>

            <form
              onSubmit={agregarCategoria}
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
              noValidate
            >
              <div className="flex-1">
                <Campo
                  etiqueta="Nueva categoría"
                  value={nuevaCategoria}
                  onChange={(evento) => {
                    setNuevaCategoria(evento.target.value);
                    setErrorNuevaCategoria(null);
                  }}
                  ayuda="Por ejemplo: Parrilla, Bebidas, Postres."
                  error={errorNuevaCategoria}
                  disabled={ocupado}
                />
              </div>
              <Boton
                tipo="submit"
                aria-label="Agregar categoría"
                icono={<Plus size={16} aria-hidden="true" />}
                cargando={accionEnCurso === "crear-categoria"}
                disabled={ocupado && accionEnCurso !== "crear-categoria"}
              >
                Agregar
              </Boton>
            </form>

            {categoriasLocales.length === 0 ? (
              <p className="mt-4 text-sm text-madera">
                Todavía no hay categorías.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-madera/10">
                {categoriasLocales.map((categoria) => {
                  const claveAccion = `categoria:${categoria.id_categoria}`;
                  const guardando =
                    accionEnCurso === `${claveAccion}:nombre`;
                  const desactivando =
                    accionEnCurso === `${claveAccion}:activo`;

                  return (
                    <li key={categoria.id_categoria} className="py-3">
                      {editandoCategoria === categoria.id_categoria ? (
                        <form
                          onSubmit={guardarRenombreCategoria}
                          className="space-y-2"
                          noValidate
                        >
                          <Campo
                            etiqueta={`Nuevo nombre de la categoría "${categoria.nombre}"`}
                            value={nombreCategoriaEditada}
                            onChange={(evento) => {
                              setNombreCategoriaEditada(evento.target.value);
                              setErrorCategoriaEditada(null);
                            }}
                            error={errorCategoriaEditada}
                            disabled={ocupado}
                          />
                          <div className="flex gap-2">
                            <Boton
                              tipo="submit"
                              cargando={guardando}
                              disabled={ocupado && !guardando}
                            >
                              Guardar
                            </Boton>
                            <Boton
                              variante="secundario"
                              onClick={() => setEditandoCategoria(null)}
                              disabled={ocupado}
                            >
                              Cancelar
                            </Boton>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-carbon">
                              {categoria.nombre}
                            </span>
                            <Insignia
                              texto={categoria.activo ? "Activa" : "Inactiva"}
                              color={categoria.activo ? "verde" : "gris"}
                            />
                          </div>

                          <div className="flex gap-1">
                            <Boton
                              variante="texto"
                              aria-label={`Renombrar la categoría ${categoria.nombre}`}
                              title={`Renombrar la categoría ${categoria.nombre}`}
                              icono={<Pencil size={16} aria-hidden="true" />}
                              disabled={ocupado}
                              onClick={() =>
                                comenzarRenombreCategoria(categoria)
                              }
                            >
                              <span className="sr-only">Renombrar</span>
                            </Boton>

                            <Boton
                              variante="texto"
                              aria-label={
                                categoria.activo
                                  ? `Desactivar la categoría ${categoria.nombre}`
                                  : `Activar la categoría ${categoria.nombre}`
                              }
                              title={
                                categoria.activo
                                  ? `Desactivar la categoría ${categoria.nombre}`
                                  : `Activar la categoría ${categoria.nombre}`
                              }
                              icono={
                                categoria.activo ? (
                                  <PowerOff
                                    size={16}
                                    className="text-ladrillo"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <RotateCcw
                                    size={16}
                                    className="text-hoja"
                                    aria-hidden="true"
                                  />
                                )
                              }
                              cargando={desactivando}
                              disabled={ocupado && !desactivando}
                              onClick={() => cambiarActivoCategoria(categoria)}
                            >
                              <span className="sr-only">
                                {categoria.activo ? "Desactivar" : "Activar"}
                              </span>
                            </Boton>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="titulo-estaciones"
            className="rounded-2xl border border-madera/10 bg-crema/40 p-4"
          >
            <h3
              id="titulo-estaciones"
              className="text-base font-semibold text-carbon"
            >
              Estaciones
            </h3>
            <p className="mt-1 text-xs text-madera">
              Las estaciones no se borran: se renombran. Los productos y las
              comandas guardan su identificador, no el nombre.
            </p>

            <form
              onSubmit={agregarEstacion}
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
              noValidate
            >
              <div className="flex-1">
                <Campo
                  etiqueta="Nueva estación"
                  value={nuevaEstacion}
                  onChange={(evento) => {
                    setNuevaEstacion(evento.target.value);
                    setErrorNuevaEstacion(null);
                  }}
                  ayuda="Por ejemplo: Cocina, Barra, Parrilla."
                  error={errorNuevaEstacion}
                  disabled={ocupado}
                />
              </div>
              <Boton
                tipo="submit"
                aria-label="Agregar estación"
                icono={<Plus size={16} aria-hidden="true" />}
                cargando={accionEnCurso === "crear-estacion"}
                disabled={ocupado && accionEnCurso !== "crear-estacion"}
              >
                Agregar
              </Boton>
            </form>

            {estacionesLocales.length === 0 ? (
              <p className="mt-4 text-sm text-madera">
                Todavía no hay estaciones.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-madera/10">
                {estacionesLocales.map((estacion) => {
                  const claveAccion = `estacion:${estacion.id_estacion}:nombre`;
                  const guardando = accionEnCurso === claveAccion;

                  return (
                    <li key={estacion.id_estacion} className="py-3">
                      {editandoEstacion === estacion.id_estacion ? (
                        <form
                          onSubmit={guardarRenombreEstacion}
                          className="space-y-2"
                          noValidate
                        >
                          <Campo
                            etiqueta={`Nuevo nombre de la estación "${estacion.nombre}"`}
                            value={nombreEstacionEditada}
                            onChange={(evento) => {
                              setNombreEstacionEditada(evento.target.value);
                              setErrorEstacionEditada(null);
                            }}
                            error={errorEstacionEditada}
                            disabled={ocupado}
                          />
                          <div className="flex gap-2">
                            <Boton
                              tipo="submit"
                              cargando={guardando}
                              disabled={ocupado && !guardando}
                            >
                              Guardar
                            </Boton>
                            <Boton
                              variante="secundario"
                              onClick={() => setEditandoEstacion(null)}
                              disabled={ocupado}
                            >
                              Cancelar
                            </Boton>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-carbon">
                            {estacion.nombre}
                          </span>

                          <Boton
                            variante="texto"
                            aria-label={`Renombrar la estación ${estacion.nombre}`}
                            title={`Renombrar la estación ${estacion.nombre}`}
                            icono={<Pencil size={16} aria-hidden="true" />}
                            disabled={ocupado}
                            onClick={() =>
                              comenzarRenombreEstacion(estacion)
                            }
                          >
                            <span className="sr-only">Renombrar</span>
                          </Boton>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="flex justify-end">
          <Boton variante="secundario" onClick={alCerrar} disabled={ocupado}>
            Cerrar ventana
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
