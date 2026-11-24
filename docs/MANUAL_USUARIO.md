# Manual de usuario — Asadero Doña Pula (SIGA-DP)

Este documento acompañanos a la que se encuentra en Canva (lo título de ambos: **Manual de usuario — Asadero Doña Pula**). Las pantallas están vistas reales (capturas) de los módulos del sistema al igual que en el documento de Canva. La estructura básica de cada pantalla es: título, identificación y descripción de la función, y explicación de los botones que generan acciones.

> La identidad visual: Doña Pula. Si observas que algunas pantallas se presienten en color carbón (#0B0B0B), cara miel (#D9A441), limadora (#0F2612) o verde, actúa siendo consistente.

---

## Índice

1. [Iniciando sesión](#1-iniciando-sesión)
2. [Inicio](#2-inicio)
3. [Reportes](#3-reportes)
4. [Mesas](#4-mesas)
5. [Productos](#5-productos)
6. [Personal](#6-personal)
7. [Inventario](#7-inventario)
8. [Propinas](#8-propinas)
9. [Cuentas](#9-cuentas)
10. [Facturación](#10-facturación)
11. [Integraciones](#11-integraciones)
12. [Bitácora](#12-bitácora)

---

## 1. Iniciando sesión

Este es el punto de entrada. El formulario pide usuario y clave, ambos de acceso a la base de datos y a las ventanas. Los valores predeterminados son:

- Usuario: `gerente`
- Clave: `gerente01` (inicial del responsable del asadero)

**Botones o elementos que observas:**

| Elemento | Significado | Acción |
|---|---|---|
| Campo del usuario | Nombre de quien accede al sistema | Vacío por defecto, escríbelo. |
| Campo del password | Contraseña del usuario | Vacío por defecto, escríbela. |
| Botón "Iniciar sesión" | Confirma el acceso al sistema | Genera el token de sesión y abre el módulo inicial. |
| "¿Olvidaste la clave?" | Guarda la pregunta, no quita datos. | Consume un click. |

## 2. Inicio

La página principal de Doña Pula después de iniciar sesión. Entrega el menú de acceso principal a los módulos del restaurante, el logo, y a la opción "Obtén un 50% de descuento". Botón "Salir" en la esquina.

## 3. Reportes

El módulo de reportes con 51 reportes: desde los de ventas (tickets por día, reporte de propinas, fechas y cajeros, ventas por forma de pago, canales, estación), los de productos (más vendidos por cantidad y por importe), y los de auditoría (Bitácora por mes/día/detalle). Filtros: desde/hasta y páginas pares.

## 4. Mesas

El plano de mesas y la agenda. Visualizarás: en la barra superior opciones (Mesas y reservas, Pedidos, Cocina, Propinas, Cuentas, Facturación, Corte de caja), en la barra lateral el menú principal de acceso a módulos, y en el plano los iconos de "Mesa 1", "Mesa 2", etc. Las mesas aparecen con capacidades visuales y estados "Ocupada", "Libre", "Limpiebas".

## 5. Productos

Catálogo amplio (183 productos): marca Doña Pula, productos de desarrollo, estructura de pedidos. Permite cambio de disponibilidad y cuenta via botones "Editar", "Marcar agotado", "Dar de baja", y filtros por estado activo/inactivo.

## 6. Personal

Empleados del sistema con cédulas, nombres, roles (dueno, gerente, capitan, cajero, mesero, anfitrion, cocina, almacen, etc), estado (Activo/Inactivo/Bloqueado), fecha de ingreso y demás. Botón "Nuevo empleado" y "Dar de baja".

## 7. Inventario

Inventario de insumos con minimo/faltante y puntos de acceso (Almacén, Cocina, Barra). Similares los móviles con nombrado como "faltante".

## 8. Propinas

Registro de propinas a facturar por empleado y fecha, incluye conciliación (esperado/contado/diferencia) y formas de pago (Tiqueta, y otros más).

## 9. Cuentas

Cuentas abiertas del restaurante. Botones de Agregar y Facturar. Puedes buscar y verlas sobre mesas, ver los productos consumidos en cada cuenta y detalles.

## 10. Facturación

Emisión de facturas (comprobantes fiscales) desde las cuentas, con NCF y rango fiscal. Anulación y edición de factura.

## 11. Integraciones

Estado de las integraciones externas: PayPal, IMECF, Asistente IA. Botones de verificación y prueba de conexión.

## 12. Bitácora

Registro de auditoría: quién hizo qué y cuándo. Filtros de fechas, acción y tabla. Muestra registros con fecha/hora/usuario/acción/detalle.

---

## Anexo: la identidad visual

- Paleta Doña Pula: carbón (#0B0B0B), miel (#D9A441), limadora, crema, negros.
- Tipografía: Poppins.
- Logos: Doña Pula y la mascota en la esquina.
- La app es en español.
