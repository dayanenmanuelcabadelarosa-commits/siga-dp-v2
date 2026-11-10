/*
  errores.js — el error de la API y el envoltorio de rutas.
  --------------------------------------------------------

  Vive aparte de app.js para que las rutas y los servicios puedan usarlo sin
  importar a app.js y sin que queden importaciones en círculo.

  Regla de oro 7: cada error que ve el usuario lleva un mensaje que se entiende,
  en español, sin nombres de tablas ni de columnas.
*/

/*
  ErrorDeApi
  ----------
  Un error que ya sabe con qué código HTTP debe salir y que trae un mensaje
  pensado para que lo lea una persona, no un programador.

  Ejemplos:
    new ErrorDeApi(401, "SIN_SESION", "Tu sesión venció. Vuelve a entrar.")
    new ErrorDeApi(400, "DATOS_INVALIDOS", "El nombre no puede quedar vacío.")
*/
export class ErrorDeApi extends Error {
  constructor(estado, codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorDeApi";
    this.estado = estado;
    this.codigo = codigo;
  }
}

/*
  asyncHandler
  ------------
  Envuelve una función de ruta y manda cualquier error al manejador global.

  Nota honesta: Express 5 ya reenvía los errores de las rutas `async` por su
  cuenta. Este envoltorio se mantiene igual porque el plan lo exige de forma
  explícita y porque deja la intención escrita en el código: si algún día se
  cambia de versión, las rutas siguen protegidas.
*/
export function asyncHandler(fn) {
  return function envuelto(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
