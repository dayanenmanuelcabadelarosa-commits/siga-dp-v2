/*
  personal.js (rutas) — el módulo de Personal y usuarios.
  ------------------------------------------------------

    GET   /api/personal                 la lista de empleados y los roles asignables
    POST  /api/personal                 crear empleado + cuenta en una transacción
    PATCH /api/personal/:id             editar nombre, teléfono o rol
    POST  /api/personal/:id/baja        dar de baja (empleado y cuenta)
    POST  /api/personal/:id/reactivar   volver a activar a quien fue dado de baja
    POST  /api/personal/:id/desbloquear habilitar una cuenta bloqueada (RN-24)
    POST  /api/personal/:id/clave       restablecer la clave de acceso

  Todas exigen el permiso ADMINISTRAR_PERSONAL. Además hay dos defensas que no
  están en la matriz de permisos, porque no son "qué módulo ve" sino "a quién
  puede tocar":

    1. Nadie administra a alguien de un nivel superior al suyo (el nivel sale
       de `rol.nivel`). Así un gerente no puede crear un dueño, ni cambiarse el
       rol, ni resetear la clave del dueño para entrar con su cuenta.
    2. Nadie se da de baja a sí mismo ni se cambia su propio rol. Evita que un
       administrador se deje fuera del sistema por un descuido.

  La comprobación de nivel se hace SIEMPRE en el servidor. La pantalla también
  deshabilita los botones que no aplican, pero eso es comodidad: la seguridad
  está aquí.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { cifrarClave } from "../acceso/claves.js";
import { conTransaccion, consultar } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  esquemaCambiarClave,
  esquemaCrearEmpleado,
  esquemaEditarEmpleado,
} from "../validaciones/personal.js";
import { validar } from "../validaciones/validar.js";

/*
  El estado que ve la pantalla es el estado efectivo: para poder entrar hacen
  falta las dos cosas, el empleado activo y la cuenta activa. Si cualquiera de
  las dos está Inactiva, la fila se muestra Inactiva; si alguna está Bloqueada,
  se muestra Bloqueada.
*/
const ESTADO_EFECTIVO = `
  CASE
    WHEN e.estado = 'Inactivo' OR u.estado = 'Inactivo' THEN 'Inactivo'
    WHEN e.estado = 'Bloqueado' OR u.estado = 'Bloqueado' THEN 'Bloqueado'
    ELSE 'Activo'
  END
`;

const CAMPOS_DEL_EMPLEADO = `
  e.id_empleado,
  e.cedula,
  e.nombre,
  e.telefono,
  e.fecha_ingreso,
  e.id_rol,
  r.codigo  AS rol,
  r.nombre  AS rol_nombre,
  r.nivel,
  u.id_usuario,
  u.usuario,
  e.estado  AS estado_empleado,
  u.estado  AS estado_usuario,
  u.intentos_fallidos,
  u.ultimo_acceso,
  ${ESTADO_EFECTIVO} AS estado
`;

const DESDE_EL_EMPLEADO = `
  FROM empleado e
  JOIN rol r ON r.id_rol = e.id_rol
  LEFT JOIN usuario u ON u.id_empleado = e.id_empleado
`;

/** Lee una fila completa del empleado, con su rol y su cuenta. */
async function buscarEmpleado(consultarUno, id, { bloquear = false } = {}) {
  return consultarUno(
    `SELECT ${CAMPOS_DEL_EMPLEADO}
       ${DESDE_EL_EMPLEADO}
      WHERE e.id_empleado = $1
      ${bloquear ? "FOR UPDATE OF e" : ""}`,
    [id],
  );
}

/** El id de la dirección, revisado antes de tocar la base. */
function idDeLaRuta(req) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "El identificador del empleado no es válido.",
    );
  }

  return id;
}

/** Un empleado no puede administrar a alguien de un nivel superior al suyo. */
function revisarNivel(actor, objetivo) {
  if (objetivo.nivel > actor.nivel) {
    throw new ErrorDeApi(
      403,
      "SIN_PERMISO",
      "No puedes administrar a alguien con un rol de nivel superior al tuyo.",
    );
  }
}

/** El rol que se quiere asignar tiene que existir y no superar el nivel del actor. */
async function revisarRolAsignable(consultarUno, idRol, actor) {
  const rol = await consultarUno(
    `SELECT id_rol, codigo, nombre, nivel FROM rol WHERE id_rol = $1`,
    [idRol],
  );

  if (!rol) {
    throw new ErrorDeApi(400, "DATOS_INVALIDOS", "Ese rol no existe.");
  }

  if (rol.nivel > actor.nivel) {
    throw new ErrorDeApi(
      403,
      "SIN_PERMISO",
      "No puedes asignar un rol de nivel superior al tuyo.",
    );
  }

  return rol;
}

/** Traduce una violación de unicidad de PostgreSQL a un mensaje para la persona. */
function conflictoDeUnicidad(error) {
  if (error?.code !== "23505") return null;

  if (error.constraint === "uq_empleado_cedula") {
    return new ErrorDeApi(
      409,
      "CEDULA_DUPLICADA",
      "Ya hay un empleado registrado con esa cédula.",
    );
  }

  if (error.constraint === "uq_usuario_nombre") {
    return new ErrorDeApi(
      409,
      "USUARIO_DUPLICADO",
      "Ese nombre de usuario ya está ocupado. Elige otro.",
    );
  }

  return null;
}

export function rutasDePersonal() {
  const rutas = express.Router();

  rutas.use(requiereSesion, requierePermiso("ADMINISTRAR_PERSONAL"));

  /* ------------------------------------------------------------- la lista */

  rutas.get(
    "/",
    asyncHandler(async (req, res) => {
      const empleados = await consultar(
        `SELECT ${CAMPOS_DEL_EMPLEADO}
           ${DESDE_EL_EMPLEADO}
          ORDER BY (${ESTADO_EFECTIVO} = 'Activo') DESC, e.nombre`,
      );

      /*
        Solo se ofrecen los roles que esta persona puede asignar. El dueño ve
        todos; un gerente no ve el rol de dueño porque no podría asignarlo.
      */
      const roles = await consultar(
        `SELECT id_rol, codigo, nombre, nivel, descripcion
           FROM rol
          WHERE nivel <= $1
          ORDER BY nivel DESC, id_rol`,
        [req.sesion.nivel],
      );

      exito(res, { empleados, roles });
    }),
  );

  /* -------------------------------------------------------------- crear */

  rutas.post(
    "/",
    validar(esquemaCrearEmpleado),
    asyncHandler(async (req, res) => {
      const { cedula, nombre, telefono, id_rol, usuario, clave } = req.datos;

      // Se cifra antes de abrir la transacción: scrypt es lento a propósito y no
      // conviene tener una conexión de la base ocupada mientras calcula.
      const hash = cifrarClave(clave);

      let creado;

      try {
        creado = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarRolAsignable(consultarUno, id_rol, req.sesion);

            const empleado = await consultarUno(
              `INSERT INTO empleado (cedula, nombre, telefono, id_rol)
               VALUES ($1, $2, $3, $4)
               RETURNING id_empleado`,
              [cedula, nombre, telefono ?? null, id_rol],
            );

            await consultarUno(
              `INSERT INTO usuario (usuario, clave_hash, id_empleado)
               VALUES ($1, $2, $3)
               RETURNING id_usuario`,
              [usuario, hash, empleado.id_empleado],
            );

            return buscarEmpleado(consultarUno, empleado.id_empleado);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        const conflicto = conflictoDeUnicidad(error);
        if (conflicto !== null) throw conflicto;
        throw error;
      }

      exito(res, creado, 201);
    }),
  );

  /* ------------------------------------------------------------- editar */

  rutas.patch(
    "/:id",
    validar(esquemaEditarEmpleado),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req);
      const cambios = req.datos;

      const actualizado = await conTransaccion(
        async ({ consultarUno, consultar: consultarEnLaTransaccion }) => {
          const actual = await buscarEmpleado(consultarUno, id, { bloquear: true });

          if (!actual) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese empleado no existe.");
          }

          revisarNivel(req.sesion, actual);

          if (
            actual.id_empleado === req.sesion.idEmpleado &&
            cambios.id_rol !== undefined &&
            cambios.id_rol !== actual.id_rol
          ) {
            throw new ErrorDeApi(
              400,
              "DATOS_INVALIDOS",
              "No puedes cambiarte el rol a ti mismo.",
            );
          }

          if (cambios.id_rol !== undefined) {
            await revisarRolAsignable(consultarUno, cambios.id_rol, req.sesion);
          }

          const nombreFinal = cambios.nombre ?? actual.nombre;
          const telefonoFinal =
            cambios.telefono === undefined ? actual.telefono : cambios.telefono;
          const rolFinal = cambios.id_rol ?? actual.id_rol;

          await consultarEnLaTransaccion(
            `UPDATE empleado
                SET nombre = $1, telefono = $2, id_rol = $3
              WHERE id_empleado = $4`,
            [nombreFinal, telefonoFinal, rolFinal, id],
          );

          return buscarEmpleado(consultarUno, id);
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, actualizado);
    }),
  );

  /* --------------------------------------------------------------- baja */

  rutas.post(
    "/:id/baja",
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req);

      const dadoDeBaja = await conTransaccion(
        async ({ consultarUno, consultar: consultarEnLaTransaccion }) => {
          const actual = await buscarEmpleado(consultarUno, id, { bloquear: true });

          if (!actual) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese empleado no existe.");
          }

          revisarNivel(req.sesion, actual);

          if (actual.id_empleado === req.sesion.idEmpleado) {
            throw new ErrorDeApi(
              400,
              "DATOS_INVALIDOS",
              "No puedes darte de baja a ti mismo.",
            );
          }

          if (actual.estado === "Inactivo") {
            throw new ErrorDeApi(
              409,
              "EMPLEADO_YA_INACTIVO",
              "Ese empleado ya está dado de baja.",
            );
          }

          await consultarEnLaTransaccion(
            `UPDATE empleado SET estado = 'Inactivo' WHERE id_empleado = $1`,
            [id],
          );

          await consultarEnLaTransaccion(
            `UPDATE usuario
                SET estado = 'Inactivo', intentos_fallidos = 0
              WHERE id_empleado = $1`,
            [id],
          );

          return buscarEmpleado(consultarUno, id);
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, dadoDeBaja);
    }),
  );

  /* ---------------------------------------------------------- reactivar */

  rutas.post(
    "/:id/reactivar",
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req);

      const reactivado = await conTransaccion(
        async ({ consultarUno, consultar: consultarEnLaTransaccion }) => {
          const actual = await buscarEmpleado(consultarUno, id, { bloquear: true });

          if (!actual) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese empleado no existe.");
          }

          revisarNivel(req.sesion, actual);

          if (actual.estado !== "Inactivo") {
            throw new ErrorDeApi(
              409,
              "EMPLEADO_YA_ACTIVO",
              "Ese empleado no está dado de baja.",
            );
          }

          await consultarEnLaTransaccion(
            `UPDATE empleado SET estado = 'Activo' WHERE id_empleado = $1`,
            [id],
          );

          await consultarEnLaTransaccion(
            `UPDATE usuario
                SET estado = 'Activo', intentos_fallidos = 0
              WHERE id_empleado = $1`,
            [id],
          );

          return buscarEmpleado(consultarUno, id);
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, reactivado);
    }),
  );

  /* -------------------------------------------------------- desbloquear */

  rutas.post(
    "/:id/desbloquear",
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req);

      const desbloqueado = await conTransaccion(
        async ({ consultarUno, consultar: consultarEnLaTransaccion }) => {
          const actual = await buscarEmpleado(consultarUno, id, { bloquear: true });

          if (!actual) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese empleado no existe.");
          }

          revisarNivel(req.sesion, actual);

          if (actual.estado === "Inactivo") {
            throw new ErrorDeApi(
              409,
              "EMPLEADO_INACTIVO",
              "Ese empleado está dado de baja. Reactívalo antes de desbloquear su cuenta.",
            );
          }

          if (actual.id_usuario === null) {
            throw new ErrorDeApi(
              409,
              "SIN_CUENTA",
              "Ese empleado no tiene una cuenta de acceso.",
            );
          }

          if (actual.estado !== "Bloqueado") {
            throw new ErrorDeApi(
              409,
              "CUENTA_NO_BLOQUEADA",
              "Esa cuenta no está bloqueada.",
            );
          }

          await consultarEnLaTransaccion(
            `UPDATE usuario
                SET estado = 'Activo', intentos_fallidos = 0
              WHERE id_empleado = $1`,
            [id],
          );

          /*
            El estado Bloqueado puede estar en el empleado o en la cuenta. Se
            limpia en los dos lados; el empleado dado de baja (Inactivo) no se
            toca porque eso ya se rechazó arriba.
          */
          await consultarEnLaTransaccion(
            `UPDATE empleado
                SET estado = 'Activo'
              WHERE id_empleado = $1 AND estado = 'Bloqueado'`,
            [id],
          );

          return buscarEmpleado(consultarUno, id);
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, desbloqueado);
    }),
  );

  /* ------------------------------------------------------ cambio de clave */

  rutas.post(
    "/:id/clave",
    validar(esquemaCambiarClave),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req);
      const hash = cifrarClave(req.datos.clave);

      const empleado = await conTransaccion(
        async ({ consultarUno, consultar: consultarEnLaTransaccion }) => {
          const actual = await buscarEmpleado(consultarUno, id, { bloquear: true });

          if (!actual) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese empleado no existe.");
          }

          revisarNivel(req.sesion, actual);

          if (actual.id_usuario === null) {
            throw new ErrorDeApi(
              409,
              "SIN_CUENTA",
              "Ese empleado no tiene una cuenta de acceso.",
            );
          }

          /*
            Cambiar la clave NO desbloquea la cuenta: son dos acciones distintas
            y la pantalla las ofrece por separado. Lo que sí se hace es poner los
            intentos fallidos en cero, porque pertenecían a la clave anterior.
          */
          await consultarEnLaTransaccion(
            `UPDATE usuario
                SET clave_hash = $1, intentos_fallidos = 0
              WHERE id_empleado = $2`,
            [hash, id],
          );

          return actual;
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, {
        mensaje: `La clave de ${empleado.nombre} quedó actualizada.`,
      });
    }),
  );

  return rutas;
}
