/*
  ModalProducto.tsx — el formulario para crear o editar un producto.
  -----------------------------------------------------------------

  La disponibilidad y el estado de catálogo no se cambian aquí: tienen sus
  propias acciones en la tabla, para que no se confundan con el precio o la
  categoría. En la edición se muestran como información, con sus dos valores
  separados.

  El precio viaja como texto ("350.50") para no perder los centavos. La
  validación de este lado evita un viaje inútil; la de verdad es la del servidor,
  y su mensaje se muestra tal cual si algo falla.
*/

import { Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type {
  Categoria,
  DatosParaProducto,
  Estacion,
  Producto,
} from "../../api/productos";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";
import { Selector } from "../../componentes/Selector";

export type DatosDelFormularioProducto =
  | { modo: "crear"; datos: DatosParaProducto }
  | { modo: "editar"; datos: DatosParaProducto };

export interface ModalProductoProps {
  /** `null` para crear; una fila para editar. */
  producto: Producto | null;
  categorias: readonly Categoria[];
  estaciones: readonly Estacion[];
  alCerrar: () => void;
  /** Si falla, el modal se queda abierto y muestra el error. */
  alGuardar: (entrada: DatosDelFormularioProducto) => Promise<void>;
}

interface ErroresDelFormulario {
  nombre?: string;
  precio?: string;
  id_categoria?: string;
  id_estacion?: string;
  tiempo_estimado_minutos?: string;
}

const PRECIO_VALIDO = /^\d{1,10}(\.\d{1,2})?$/;

export function ModalProducto({
  producto,
  categorias,
  estaciones,
  alCerrar,
  alGuardar,
}: ModalProductoProps) {
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [precio, setPrecio] = useState(
    producto === null ? "" : producto.precio.toFixed(2),
  );
  const [idCategoria, setIdCategoria] = useState(
    producto === null ? "" : String(producto.id_categoria),
  );
  const [idEstacion, setIdEstacion] = useState(
    producto === null ? "" : String(producto.id_estacion),
  );
  const minutosDelProducto = producto?.tiempo_estimado_minutos ?? null;

  const [tiempoEstimado, setTiempoEstimado] = useState(
    minutosDelProducto === null ? "" : String(minutosDelProducto),
  );
  const [errores, setErrores] = useState<ErroresDelFormulario>({});
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /*
    Al editar se conserva la categoría actual aunque esté inactiva: quitarla de
    la lista obligaría a cambiarla para poder guardar cualquier otra cosa. La
    advertencia de abajo explica que para reactivar hace falta una activa.
  */
  const categoriasDisponibles = categorias.filter(
    (categoria) =>
      categoria.activo ||
      (producto !== null && categoria.id_categoria === producto.id_categoria),
  );

  const categoriaElegida = categoriasDisponibles.find(
    (categoria) => String(categoria.id_categoria) === idCategoria,
  );

  function validar(): boolean {
    const nuevos: ErroresDelFormulario = {};
    const nombreLimpio = nombre.trim();
    const precioLimpio = precio.trim();

    if (nombreLimpio === "") {
      nuevos.nombre = "Escribe el nombre del producto.";
    } else if (nombreLimpio.length > 80) {
      nuevos.nombre = "El nombre del producto no puede pasar de 80 caracteres.";
    }

    if (precioLimpio === "") {
      nuevos.precio = "Escribe el precio.";
    } else if (!PRECIO_VALIDO.test(precioLimpio)) {
      nuevos.precio =
        "El precio debe ser un número mayor que cero, con hasta dos decimales.";
    } else if (!(Number(precioLimpio) > 0)) {
      nuevos.precio = "El precio debe ser mayor que cero.";
    }

    if (idCategoria === "") {
      nuevos.id_categoria = "Elige una categoría.";
    }

    if (idEstacion === "") {
      nuevos.id_estacion = "Elige una estación.";
    }

    const tiempoLimpio = tiempoEstimado.trim();

    if (tiempoLimpio !== "" && !/^\d{1,3}$/.test(tiempoLimpio)) {
      nuevos.tiempo_estimado_minutos =
        "Los minutos estimados deben ser un número entero.";
    } else if (tiempoLimpio !== "" && Number(tiempoLimpio) <= 0) {
      nuevos.tiempo_estimado_minutos =
        "Los minutos estimados deben ser mayores que cero.";
    }

    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function guardar(): Promise<void> {
    if (!validar()) return;

    setEnviando(true);
    setErrorDelServidor(null);

    try {
      const tiempoLimpio = tiempoEstimado.trim();

      const datos: DatosParaProducto = {
        nombre: nombre.trim(),
        precio: precio.trim(),
        id_categoria: Number(idCategoria),
        id_estacion: Number(idEstacion),
        tiempo_estimado_minutos:
          tiempoLimpio === "" ? null : Number(tiempoLimpio),
      };

      await alGuardar({
        modo: producto === null ? "crear" : "editar",
        datos,
      });
    } catch (fallo) {
      setErrorDelServidor(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void guardar();
  }

  return (
    <Modal
      titulo={producto === null ? "Nuevo producto" : `Editar ${producto.nombre}`}
      alCerrar={alCerrar}
      cerrable={!enviando}
    >
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {producto !== null && (
          <div className="rounded-xl bg-crema px-3 py-2 text-xs text-madera">
            <p>
              Catálogo:{" "}
              <strong>{producto.activo ? "Activo" : "Inactivo"}</strong>
              {" · "}
              Disponibilidad:{" "}
              <strong>{producto.disponible ? "Disponible" : "Agotado"}</strong>
            </p>
            <p className="mt-1">
              La disponibilidad y la baja se cambian desde la tabla.
            </p>
          </div>
        )}

        {categoriaElegida !== undefined && !categoriaElegida.activo && (
          <Alerta tipo="aviso">
            Esta categoría está inactiva. Para reactivar el producto, elige una
            categoría activa.
          </Alerta>
        )}

        <Campo
          etiqueta="Nombre"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          ayuda="Como aparece en el menú y en la comanda."
          error={errores.nombre}
        />

        <Campo
          etiqueta="Precio"
          type="text"
          inputMode="decimal"
          value={precio}
          onChange={(evento) => setPrecio(evento.target.value)}
          ayuda="En pesos dominicanos, con hasta dos decimales."
          error={errores.precio}
        />

        <Campo
          etiqueta="Minutos estimados"
          type="text"
          inputMode="numeric"
          placeholder="Sin estimar"
          value={tiempoEstimado}
          onChange={(evento) => setTiempoEstimado(evento.target.value)}
          ayuda="Cuánto se toma el plato. El asistente de IA usa este tiempo; si queda vacío, dice que no está estimado."
          error={errores.tiempo_estimado_minutos}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Selector
            etiqueta="Categoría"
            value={idCategoria}
            onChange={(evento) => setIdCategoria(evento.target.value)}
            opciones={categoriasDisponibles.map((categoria) => ({
              valor: categoria.id_categoria,
              texto: categoria.activo
                ? categoria.nombre
                : `${categoria.nombre} (inactiva)`,
            }))}
            marcador="Elige una categoría…"
            error={errores.id_categoria}
          />

          <Selector
            etiqueta="Estación"
            value={idEstacion}
            onChange={(evento) => setIdEstacion(evento.target.value)}
            opciones={estaciones.map((estacion) => ({
              valor: estacion.id_estacion,
              texto: estacion.nombre,
            }))}
            marcador="Elige una estación…"
            error={errores.id_estacion}
          />
        </div>

        {errorDelServidor !== null && (
          <Alerta tipo="error" titulo="No se pudo guardar">
            {errorDelServidor}
          </Alerta>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton
            variante="secundario"
            onClick={alCerrar}
            disabled={enviando}
          >
            Cancelar
          </Boton>

          <Boton
            tipo="submit"
            cargando={enviando}
            textoDeCarga="Guardando…"
            icono={<Save size={16} aria-hidden="true" />}
          >
            {producto === null ? "Crear producto" : "Guardar cambios"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
