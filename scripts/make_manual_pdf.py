"""Genera docs/manual-usuario.pdf: manual de usuario de Asadero Doña Pula (SIGA-DP).

Incluye, por pantalla: captura de pantalla real + descripción de cada botón/elemento + casos de uso.
Paleta Doña Pula: carbón, miel, lima, crema.
"""
from fpdf import FPDF

MIL = (217, 164, 65)      # D9A441
CARBON = (11, 11, 11)     # 0B0B0B
CREMA = (251, 247, 239)  # FBF7EF
GRIS = (60, 60, 60)

T = "C:\\Users\\dayan\\AppData\\Local\\Temp\\opencode-browser-"

SCREENS = [
    {
        "titulo": "Iniciando sesión",
        "img": T + "9zIT0f\\0\\screenshot.jpeg",
        "resumen": "Formulario de entrada a la aplicación: campos de usuario y clave y generación del token de sesión.",
        "elementos": [
            ("Campo del usuario", "Nombre de quien accede al sistema. Vacío por defecto: escríbelo."),
            ("Campo de clave/password", "Contraseña del usuario. Vacío por defecto: escríbela."),
            ("Botón Iniciar sesión", "Confirma el acceso al sistema: genera el token de sesión y abre el módulo inicial."),
            ("Botón ¿Olvidaste la clave?", "Guarda la pregunta para recuperar la clave. No altera ni borra los datos."),
        ],
        "casos": [
            "Ingresar usuario y clave válidos, luego pulsar Iniciar sesión.",
            "Credenciales predeterminadas: usuario gerente y clave gerente01.",
            "Tras 3 intentos fallidos la cuenta se bloquea (RN-24) hasta que sea autorizada.",
        ],
    },
    {
        "titulo": "Inicio",
        "img": T + "BrAJ3H\\0\\screenshot.jpeg",
        "resumen": "Pantalla principal de Doña Pula: acceso rápido a los módulos del restaurante.",
        "elementos": [
            ("Menú principal", "Accesos a Mesas, Pedidos, Cocina, Propinas, Cuentas, Facturación y Corte de caja."),
            ("Logo de Doña Pula", "Identidad visual de la marca, en la esquina superior izquierda."),
            ("Botón Obtén un 50% de descuento", "Promoción mostrada en la parte superior; no genera vinculación."),
            ("Botón Salir", "Cierra la sesión."),
        ],
        "casos": [
            "Usar el menú principal para acceder a cada módulo del restaurante.",
            "El descuento es informativo: no aplica ni modifica ninguna cuenta.",
        ],
    },
    {
        "titulo": "Reportes",
        "img": T + "ZJpQsB\\0\\screenshot.jpeg",
        "resumen": "Módulo de reportes: 51 reportes disponibles, desde ventas hasta auditoría.",
        "elementos": [
            ("Categorías de reportes", "8 tipos: Ventas y caja, Productos, Cocina, Propinas, Inventario, Reservas, Personal y Resumen ejecutivo."),
            ("Filtros Desde / Hasta", "Se aplican a los reportes que usan fechas."),
            ("Botón PDF", "Descarga el reporte en formato PDF."),
            ("Botón Excel", "Exporta el reporte a fichero .xlsx."),
            ("Columnas ocultas", "Varian según el reporte; consultar antes de modificar."),
        ],
        "casos": [
            "Seleccionar categoría y periodo, ejecutar el reporte y descargar en PDF o Excel.",
            "Los reportes devuelven lo que muestra la app, sin efectos fuera del sistema.",
        ],
    },
    {
        "titulo": "Mesas",
        "img": T + "hUAhPf\\0\\screenshot.jpeg",
        "resumen": "Plano de mesas y agenda: estados actuales (libres, ocupadas, en limpieza, reservadas).",
        "elementos": [
            ("Barra superior", "Opciones de acceso: Mesas y reservas, Pedidos, Cocina, Propinas, Cuentas, Facturación y Corte de caja."),
            ("Sidebar izquierdo", "Menú principal de acceso a los módulos."),
            ("Plano de mesas", "Iconos de mesas con estados visuales y capacidades de personas."),
            ("Estados de mesa", "Libre, Ocupada, Limpieza y Reservada."),
        ],
        "casos": [
            "Ver el estado de cada mesa en el plano.",
            "Usar Mesa 1-12 del Salón y Mesa 13-18 de la Terraza.",
        ],
    },
    {
        "titulo": "Productos",
        "img": T + "khEauB\\0\\screenshot.jpeg",
        "resumen": "Catálogo amplio del menú: 183 productos con placas visuales y precios en pesos dominicanos (RD$).",
        "elementos": [
            ("Nombre del producto", "Placa visual del producto en el menú de Doña Pula."),
            ("Categoría y estación", "Categorías de producto y estaciones de producción."),
            ("Precio", "Precios en pesos dominicanos (RD$)."),
            ("Estado del producto", "Activo / Agotado."),
            ("Botones Editar, Marcado agotado, Dar de baja", "Acciones sobre el producto seleccionado."),
        ],
        "casos": [
            "Editar los datos del producto, marcarlo como agotado o darlo de baja.",
        ],
    },
    {
        "titulo": "Personal",
        "img": T + "04BLVq\\0\\screenshot.jpeg",
        "resumen": "Datos del personal: empleados, cédulas, roles, estado y fechas de ingreso.",
        "elementos": [
            ("Tabla de empleados", "Cédula, Nombre, Rol, Estado, Fecha de ingreso."),
            ("Filtros por cédula y rol", "Roles: Dueno, Gerente, Capitán, Cajero, Mesero, Anfitrión, Cocina, Almacén."),
            ("Cuentas de usuario", "Nombre de usuario, rol y estado."),
            ("Botón Nuevo empleado", "Añade personal al sistema."),
            ("Botón Dar de baja", "Coloca el empleado en estado Inactivo."),
        ],
        "casos": [
            "Registrar un nuevo empleado con sus datos.",
            "Cambiar el estado de un empleado a Inactivo.",
        ],
    },
    {
        "titulo": "Inventario",
        "img": T + "rgz92X\\0\\screenshot.jpeg",
        "resumen": "Inventario de insumos con mínimos, existencias y puntos de acceso (Almacén, Cocina, Barra).",
        "elementos": [
            ("Tabla principal", "Nombre de insumo, existencia actual, mínimo y punto de acceso."),
            ("Puntos de acceso", "Almacén, Cocina y Barra."),
            ("Movimientos", "Entradas por compra y salidas por consumo."),
            ("Botón Ajustar", "Actualiza el inventario."),
        ],
        "casos": [
            "Revisar insumos y ajustar el inventario según lo real.",
        ],
    },
    {
        "titulo": "Propinas",
        "img": T + "6jUZaV\\0\\screenshot.jpeg",
        "resumen": "Registro de propinas por empleado y fecha, con conciliación: esperado, contado y diferencia.",
        "elementos": [
            ("Tabla de propinas", "Empleado, Fecha, Cantidad, Total."),
            ("Conciliación", "Esperado, contado y diferencia (distinta de cero)."),
            ("Botón Regenerar conciliación del día", "Vuelve a generar la conciliación del día."),
            ("Filtro por fecha", "Visualiza propinas por día."),
        ],
        "casos": [
            "Registrar propinas a facturar por empleado y fecha.",
            "Revisar conciliación entre lo esperado y lo contado.",
        ],
    },
    {
        "titulo": "Cuentas",
        "img": T + "7LZM3j\\0\\screenshot.jpeg",
        "resumen": "Cuentas abiertas del restaurante: monto, mesa, mesero y productos consumidos.",
        "elementos": [
            ("Cuentas abiertas", "Mesa, monto, cliente y mesero."),
            ("Botón Facturar", "Despliega NCF, forma de pago y fecha de emisión."),
            ("Botón Agregar", "Menú de ventas para añadir a pedidos."),
            ("Botón Dividir cuenta por comensal", "Reparte la cuenta entre comensales."),
        ],
        "casos": [
            "Agregar productos a una cuenta abierta.",
            "Cobrar y facturar desde la cuenta.",
        ],
    },
    {
        "titulo": "Facturación",
        "img": T + "ImDVxe\\0\\screenshot.jpeg",
        "resumen": "Emisión de comprobantes fiscales desde las cuentas, con NCF y forma de pago.",
        "elementos": [
            ("Tabla de facturas", "NCF, forma de pago, estado y fecha de emisión."),
            ("Botones Editar y Anular", "Edición o anulación de una factura."),
            ("Botón Facturar", "Emite el comprobante fiscal."),
            ("Filtro por fecha", "Ver facturas por día."),
        ],
        "casos": [
            "Emitir comprobantes fiscales desde las cuentas.",
            "Editar o anular una factura cuando sea necesario.",
        ],
    },
    {
        "titulo": "Integraciones",
        "img": T + "OiG5e6\\0\\screenshot.jpeg",
        "resumen": "Estado de sistemas externos: PayPal, IMECF y Asistente IA, con botones de verificación.",
        "elementos": [
            ("Card PayPal", "Estado de conexión y enlace de prueba."),
            ("Card IMECF", "Comprobante emitido y timbrado."),
            ("Card Asistente IA", "Estado de grado y modelo integrado."),
            ("Botón Verificar", "Prueba de conexión con el sistema externo."),
            ("Botón Abrir login", "Abre el inicio de sesión del sistema externo."),
        ],
        "casos": [
            "Verificar la conexión de cada integración antes de usarla.",
        ],
    },
    {
        "titulo": "Bitácora",
        "img": T + "kr40l8\\0\\screenshot.jpeg",
        "resumen": "Registro de auditoría: quién hizo qué y cuándo. Filtros por fecha, acción y tabla.",
        "elementos": [
            ("Filtros Desde / Hasta", "Rango de fechas para visualizar registros."),
            ("Registro de auditoría", "Acciones registradas (ej. Comprobante emitido, Pago registrado)."),
            ("Tabla con usuarios y tablas afectadas", "Comprobante, cuenta, descuento, mesa."),
            ("Botón Refresh", "Vuelve a cargar los registros."),
        ],
        "casos": [
            "Consultar quién hizo qué y cuándo.",
            "Filtrar por fecha, acción, tabla y usuario.",
        ],
    },
]


def head(pdf, txt, size=16, color=MIL):
    pdf.set_font("helvetica", "B", size)
    pdf.set_text_color(*color)
    pdf.cell(0, 10, txt)


def texto(pdf, txt, size=10, bold=False, color=CARBON):
    pdf.set_font("helvetica", "B" if bold else "", size)
    pdf.set_text_color(*color)
    pdf.multi_cell(pdf.w - 20, 5, txt)


def portada(pdf):
    head(pdf, "Manual de usuario - Asadero Doña Pula", size=22)
    texto(pdf, "Guia profesional de pantallas y botones del sistema SIGA-DP", 14, False, GRIS)
    pdf.ln(8)
    texto(pdf, "Capturas reales de la aplicación, con descripción de cada pantalla, botón y caso de uso.")
    pdf.ln(20)
    texto(pdf, "Identidad visual", 14, True, CARBON)
    texto(pdf, "Paleta Doña Pula: carbón (#0B0B0B), miel (#D9A441), lima (#0F2612), crema (#FBF7EF).")
    texto(pdf, "Tipografía: Poppins. La app está en español.")


def add_screen(pdf, n, s):
    pdf.add_page()
    head(pdf, f"Pantalla {n}: {s['titulo']}")
    texto(pdf, s["resumen"], 10, False, GRIS)
    pdf.ln(2)
    pdf.image(s["img"], x=10, y=pdf.get_y() + 5, w=190)
    pdf.set_y(pdf.get_y() + 6)
    texto(pdf, "Botones y elementos de esta pantalla:", 12, True)
    for nombre, desc in s["elementos"]:
        texto(pdf, "- " + nombre, 10, True, MIL)
        texto(pdf, "    " + desc, 10)
    texto(pdf, "Casos de uso / Acción:", 12, True)
    for i, caso in enumerate(s["casos"], 1):
        texto(pdf, f"{i}. {caso}", 10)
    pdf.set_y(pdf.h - 12)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(*GRIS)
    pdf.cell(0, 6, "Asadero Doña Pula - Manual de usuario (SIGA-DP)")


def main():
    pdf = FPDF()
    pdf.set_auto_page_break(True, margin=20)
    pdf.add_page()
    portada(pdf)
    for n, s in enumerate(SCREENS, 1):
        add_screen(pdf, n, s)
    out = "C:\\Users\\dayan\\Desktop\\SIGA-DP\\DonaPula\\docs\\manual-usuario.pdf"
    pdf.output(out)
    print("páginas:", len(pdf.pages))
    print("saved:", out)


if __name__ == "__main__":
    main()
