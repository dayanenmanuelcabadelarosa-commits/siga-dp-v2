/*
  Configuración común de las pruebas del cliente.

  1. Añade los comparadores de jest-dom (`toBeInTheDocument`, `toBeVisible`, …)
     al `expect` de Vitest.
  2. Desmonta lo dibujado después de cada prueba. Testing Library lo hace solo
     cuando `afterEach` existe como variable global, y en este proyecto las
     pruebas importan sus utilidades de `vitest` (no hay globals). Sin esta
     limpieza, el HTML de una prueba se queda montado y la siguiente encuentra
     dos alertas, dos botones o dos tablas donde debería haber una.
  3. Da más margen a `findBy*`/`waitFor`. Su espera por defecto es de 1 segundo y
     se queda corta cuando corren muchos archivos a la vez y la máquina está
     ocupada; entonces una prueba correcta falla sin que haya un error real.
     El límite por prueba de Vitest (20 s) sigue siendo el que ataja los cuelgues.
*/

import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
