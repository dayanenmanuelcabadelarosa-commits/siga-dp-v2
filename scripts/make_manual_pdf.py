"""Genera docs/manual-usuario.pdf: manual de usuario de Asadero Doña Pula (SIGA-DP).

Diseño profesional: portada con la paleta Doña Pula (swatches de colores), una
página por pantalla con captura de pantalla real + descripción de todos los
botones/elementos + casos de uso. Paleta Doña Pula: carbón, miel, lima, crema.
Fuente: Helvetica (sistema; Poppins no está disponible en este equipo).
"""
from fpdf import FPDF

FAM = "helvetica"
MIL = (217, 164, 65)      # D9A441 miel
CARBON = (11, 11, 11)     # 0B0B0B
LIMA = (15, 38, 18)       # 0F2612 lima
CREMA = (251, 247, 239)   # FBF7EF crema
GRIS = (60, 60, 60)
GRIS_LIG = (150, 150, 150)
LIGHT_MEL = (251, 234, 202)

T = "C:\\Users\\dayan\\AppData\\Local\\Temp\\opencode-browser-"

SWATCHES = [
    ("carbón", (11, 11, 11), "#0B0B0B"),
    ("miel", MIL, "#D9A441"),
    ("lima", LIMA, "#0F2612"),
    ("crema", CREMA, "#FBF7EF"),
]

SCREENS = [
    {
        "titulo": "Iniciando sesión",
        "img": T + "ZHo7G6\\0\\screenshot.jpeg",
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
        "img": T + "AVOKC0\\0\\screenshot.jpeg",
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
        "img": T + "IlL6Ar\\0\\screenshot.jpeg",
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
        "img": T + "w1254m\\0\\screenshot.jpeg",
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
        "img": T + "sswHFm\\0\\screenshot.jpeg",
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
        "img": T + "yTuLev\\0\\screenshot.jpeg",
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
        "img": T + "vmzcQu\\0\\screenshot.jpeg",
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
        "img": T + "3hTSVw\\0\\screenshot.jpeg",
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
        "img": T + "07CNB3\\0\\screenshot.jpeg",
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
        "img": T + "TdDQtu\\0\\screenshot.jpeg",
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
        "img": T + "qQN8E8\\0\\screenshot.jpeg",
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
        "img": T + "1g3z3u\\0\\screenshot.jpeg",
        "resumen": "Registro de auditoría: quién hizo qué y cuándo. Filtros por fecha y usuario.",
        "elementos": [
            ("Filtros Desde / Hasta", "Rango de fechas para visualizar registros."),
            ("Registro de auditoría", "Qué se registra del movimiento: usuario, detalle y fecha/hora."),
            ("Botón Refresh", "Vuelve a cargar los registros."),
        ],
        "casos": [
            "Consultar quién hizo qué y cuándo.",
            "Filtrar por fecha.",
        ],
    },
]


def _font(pdf, family, style, size, color):
    pdf.set_font(family, style, size)
    pdf.set_text_color(*color)


def _fill(pdf, color):
    pdf.set_fill_color(*color)


def portada(pdf):
    pdf.add_page()
    _font(pdf, FAM, "B", 42, CARBON)
    pdf.set_xy(10, 30)
    pdf.cell(0, 14, "Manual de usuario - Asadero Doña Pula")
    _font(pdf, FAM, "", 13, GRIS)
    pdf.set_y(50)
    pdf.multi_cell(pdf.w - 20, 6, "Guía profesional de pantallas y botones del sistema SIGA-DP")
    # swatches de paleta Doña Pula
    pdf.set_y(68)
    _font(pdf, FAM, "B", 12, CARBON)
    pdf.cell(0, 9, "Paleta Doña Pula")
    for i, (name, rgb, hexs) in enumerate(SWATCHES):
        x = 10 + i * 66
        _fill(pdf, rgb)
        pdf.set_xy(x, 84)
        pdf.cell(24, 10, "", fill=True)
        pdf.set_xy(x, 98)
        _font(pdf, FAM, "", 9, CARBON)
        pdf.cell(24, 5, name + " " + hexs, align="C")
    # nota de identidad visual
    pdf.set_y(118)
    _font(pdf, FAM, "B", 13, MIL)
    pdf.cell(0, 9, "Identidad visual")
    pdf.ln(2)
    _font(pdf, FAM, "", 10, CARBON)
    pdf.multi_cell(pdf.w - 20, 5, "La app está en español. Paleta: carbón, miel, lima, crema. Fuente: Helvetica (compatible con Arial).")


def section(pdf, txt):
    _font(pdf, FAM, "B", 13, MIL)
    pdf.multi_cell(pdf.w - 20, 8, txt)
    pdf.ln(2)


def add_element(pdf, nombre, desc):
    y = pdf.get_y()
    _fill(pdf, LIGHT_MEL)
    pdf.set_xy(10, y)
    pdf.cell(190, 8, "", fill=True)
    _font(pdf, FAM, "B", 10, CARBON)
    pdf.set_xy(10, y + 1.5)
    pdf.cell(190, 6, nombre)
    pdf.set_y(y + 9)
    _font(pdf, FAM, "", 9, GRIS)
    pdf.multi_cell(pdf.w - 20, 4, desc)


def add_screen(pdf, n, s):
    pdf.add_page()
    # top strip: pantalla
    _fill(pdf, MIL)
    pdf.set_xy(10, 10)
    pdf.cell(190, 6, "", fill=True)
    _font(pdf, FAM, "", 9, CARBON)
    pdf.set_xy(10, 10)
    pdf.cell(190, 6, "PANTALLA " + str(n) + " - " + s["titulo"])
    # title
    pdf.set_xy(10, 24)
    _font(pdf, FAM, "B", 34, CARBON)
    pdf.cell(0, 12, s["titulo"])
    # summary
    pdf.set_y(42)
    _font(pdf, FAM, "", 10, GRIS)
    pdf.multi_cell(pdf.w - 20, 5, s["resumen"])
    # screenshot real
    pdf.image(s["img"], x=10, y=pdf.get_y() + 3, w=190)
    pdf.set_y(pdf.get_y() + 4)
    # botones y elementos
    section(pdf, "Botones y elementos de esta pantalla")
    for nombre, desc in s["elementos"]:
        add_element(pdf, nombre, desc)
    # casos de uso
    section(pdf, "Casos de uso / Acción")
    _font(pdf, FAM, "", 10, CARBON)
    for i, caso in enumerate(s["casos"], 1):
        pdf.multi_cell(pdf.w - 20, 5, str(i) + ". " + caso)
    # footer
    pdf.set_y(pdf.h - 12)
    _font(pdf, FAM, "", 8, GRIS_LIG)
    pdf.cell(0, 6, "Asadero Doña Pula - Manual de usuario - Página " + str(n), align="C")


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
