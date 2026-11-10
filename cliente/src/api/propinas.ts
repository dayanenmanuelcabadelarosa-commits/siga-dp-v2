/*
  propinas.ts — las llamadas del módulo Propinas (Fase 5, módulo 3).
  -----------------------------------------------------------------

  La pantalla no calcula ni inventa montos: después de registrar o cerrar, el
  servidor devuelve el resumen completo leído de PostgreSQL y aquí solo se
  guarda. La fecha del negocio la pone el servidor (America/Santo_Domingo), no
  el navegador.
*/

import { pedir } from "./cliente-http";

export type FormaDePropina = "Efectivo" | "Tarjeta";

/** Una propina ya registrada, tal como la devuelve la API. */
export interface PropinaRegistrada {
  id: number;
  monto: number;
  forma: FormaDePropina;
  referencia: string | null;
  /** Hora local del negocio, en formato HH:MM. */
  hora: string;
}

/** Una mesa que el empleado abrió hoy, con su propina si ya la registró. */
export interface MesaConPropina {
  idMesa: number;
  numero: number;
  zona: string;
  idPedido: number;
  propina: PropinaRegistrada | null;
}

/** Una propina del día, con la mesa a la que pertenece. */
export interface PropinaDelDia extends PropinaRegistrada {
  mesa: number;
  zona: string;
}

/** Lo que ve quien registra: sus mesas, sus propinas y su total. */
export interface ResumenDePropinas {
  fecha: string;
  mesas: MesaConPropina[];
  propinas: PropinaDelDia[];
  total: number;
}

/** Un cierre ya hecho. */
export interface CierreDePropinas {
  id: number;
  contado: number;
  diferencia: number;
  /** Fecha y hora local del cierre, en formato DD/MM/AAAA HH:MM. */
  cerradoEn: string;
  cerradoPor: string;
}

/** Una fila del cierre del día. */
export interface FilaDeCierre {
  idEmpleado: number;
  empleado: string;
  esperado: number;
  cierre: CierreDePropinas | null;
}

export interface TotalesDeCierre {
  totalEsperado: number;
  /** Suma de lo contado en los cierres ya hechos. */
  totalContado: number;
  totalDiferencia: number;
}

export interface ResumenDeCierre {
  fecha: string;
  filas: FilaDeCierre[];
  totales: TotalesDeCierre;
}

export function listarMisPropinas(): Promise<ResumenDePropinas> {
  return pedir<ResumenDePropinas>("/api/propinas");
}

export function registrarPropina(datos: {
  mesa: number;
  monto: string;
  forma: FormaDePropina;
  referencia?: string;
}): Promise<{
  propina: PropinaRegistrada & { mesa: number };
  resumen: ResumenDePropinas;
  mensaje: string;
}> {
  return pedir<{
    propina: PropinaRegistrada & { mesa: number };
    resumen: ResumenDePropinas;
    mensaje: string;
  }>("/api/propinas", { metodo: "POST", cuerpo: datos });
}

export function listarCierreDePropinas(): Promise<ResumenDeCierre> {
  return pedir<ResumenDeCierre>("/api/propinas/cierre");
}

export function cerrarPropinas(
  idEmpleado: number,
  contado: string,
): Promise<{
  cierre: CierreDePropinas & {
    idEmpleado: number;
    empleado: string;
    esperado: number;
  };
  resumen: ResumenDeCierre;
  mensaje: string;
}> {
  return pedir<{
    cierre: CierreDePropinas & {
      idEmpleado: number;
      empleado: string;
      esperado: number;
    };
    resumen: ResumenDeCierre;
    mensaje: string;
  }>("/api/propinas/cierre", {
    metodo: "POST",
    cuerpo: { idEmpleado, contado },
  });
}
