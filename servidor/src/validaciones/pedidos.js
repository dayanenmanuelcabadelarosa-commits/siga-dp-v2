/*
  validaciones/inventario.js ya existe; este archivo define los esquemas Zod
  para el módulo Pedidos (Fase 5, módulo 1).

  Módulo 1 cubre:
    · GET  /api/pedidos/:mesa            pedido abierto de una mesa
    · GET  /api/pedidos                  todos los pedidos abiertos
    · POST /api/pedidos/:mesa/abrir      abrir un pedido en una mesa ocupada
    · POST /api/pedidos/:mesa/lineas     agregar una línea al pedido
    · PATCH /api/pedidos/lineas/:id      editar cantidad u observación
    · DELETE /api/pedidos/lineas/:id     anular una línea (con motivo)
    · POST /api/pedidos/:mesa/enviar     enviar el pedido a cocina

  Los montos y cantidades se validan aquí; las reglas de negocio (RN-01, RN-02)
  viven en la base de datos y en las funciones fn_abrir_pedido, etc.
*/

import { z } from "zod";

const enteroPositivo = z
  .union([z.number(), z.string().regex(/^\d+$/, "Debe ser un entero mayor que cero.")])
  .transform((v) => Number(v))
  .refine((v) => Number.isInteger(v) && v > 0, "Debe ser un entero mayor que cero.");

export const esquemaAbrirPedido = z.object({
  mesero: z.string().trim().min(1).max(80).optional(),
  comensales: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 20, "Entre 1 y 20 comensales.")
    .optional()
    .default(1),
});

export const esquemaAgregarLinea = z.object({
  productoId: enteroPositivo,
  cantidad: enteroPositivo.optional().default(1),
  observacion: z.string().trim().max(160).optional().default(""),
  persona: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 20, "Comensal entre 1 y 20.")
    .optional()
    .default(1),
});

export const esquemaEditarLinea = z.object({
  cantidad: enteroPositivo.optional(),
  observacion: z.string().trim().max(160).optional(),
});

export const esquemaAnularLinea = z
  .object({
    motivo: z.string().trim().min(1).max(160).optional(),
  })
  .optional()
  .default({});

export const esquemaEnviarPedido = z.object({}).optional();
