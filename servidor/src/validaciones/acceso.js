/*
  acceso.js (validaciones) — los esquemas de Zod del inicio de sesión.
  -------------------------------------------------------------------

  Los mensajes están escritos en español y pensados para mostrarse en pantalla:
  quien los lee es la persona que está tratando de entrar, no un programador.

  Nota sobre la longitud mínima de la clave: aquí NO se exige un mínimo. Si se
  exigiera, un atacante podría distinguir "la clave es demasiado corta para
  existir" de "la clave no coincide", y además las claves viejas del local podrían
  ser cortas. Lo que sí se exige es que haya algo escrito.
*/

import { z } from "zod";

export const esquemaEntrar = z.object({
  usuario: z
    .string({ error: "Escribe tu usuario." })
    .trim()
    .min(1, "Escribe tu usuario.")
    .max(30, "El usuario no puede pasar de 30 caracteres."),
  clave: z
    .string({ error: "Escribe tu clave." })
    .min(1, "Escribe tu clave.")
    .max(200, "La clave no puede pasar de 200 caracteres."),
});
