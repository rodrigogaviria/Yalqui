/**
 * Los códigos de la base son slugs ASCII a propósito: son la llave con la que
 * el código referencia una fila, no lo que una persona lee. Este archivo es el
 * único lugar donde se traducen a texto, con sus tildes y su mayúscula inicial.
 *
 * Mostrar el código crudo en pantalla era lo que hacía aparecer «ocupacion»,
 * «edificacion» y «unico» sin tilde por toda la interfaz.
 */

const CATEGORIA_AJUSTE: Record<string, string> = {
  comodidad: "Comodidad",
  ocupacion: "Ocupación",
  mascota: "Mascota",
  parqueadero: "Parqueadero",
  servicio: "Servicio",
  otro: "Otro",
};

const TIPO_CALCULO: Record<string, string> = {
  monto_fijo: "Monto fijo",
  porcentaje: "Porcentaje",
  por_cantidad: "Por cantidad",
};

const PERIODICIDAD: Record<string, string> = {
  mensual: "Mensual",
  unico: "Único",
};

const MODELO_COBRO: Record<string, string> = {
  unico: "Único",
  recurrente: "Recurrente",
  por_uso: "Por uso",
  porcentaje: "Porcentaje",
};

const CICLO: Record<string, string> = {
  mensual: "Mensual",
  anual: "Anual",
  unico: "Único",
};

const MARCO_LEGAL: Record<string, string> = {
  vivienda_urbana: "Vivienda urbana (Ley 820)",
  comercial: "Comercial",
  habitacion: "Habitación",
  parqueadero: "Parqueadero",
  mixto: "Mixto",
};

const AMBITO_ROL: Record<string, string> = {
  global: "Global",
  inmueble: "Inmueble",
  edificacion: "Edificación",
  contrato: "Contrato",
};

const ROL: Record<string, string> = {
  admin_yalqui: "Administrador Yalqui",
  administrador_inmueble: "Administrador de inmueble",
  propietario: "Propietario",
  socio_propietario: "Socio propietario",
  inquilino: "Inquilino",
  personal_propiedad: "Personal de la propiedad",
  proveedor: "Proveedor",
};

const AMBITO_GASTO: Record<string, string> = {
  unidad: "Unidad",
  edificacion: "Edificación",
  ambos: "Ambos",
};

const AMBITO_INCIDENCIA: Record<string, string> = {
  unidad: "Unidad",
  area_comun: "Área común",
  ambos: "Ambos",
};

const RESPONSABLE: Record<string, string> = {
  propietario: "Propietario",
  inquilino: "Inquilino",
  compartido: "Compartido",
  copropiedad: "Copropiedad",
  por_definir: "Por definir",
};

const PRIORIDAD: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

const APLICA_A: Record<string, string> = {
  inquilino: "Inquilino",
  codeudor: "Codeudor",
  propietario: "Propietario",
  proveedor: "Proveedor",
};

const MODO_REQUISITO: Record<string, string> = {
  cualquiera: "Basta con uno",
  todos: "Hacen falta todos",
};

const ESTADO_UNIDAD: Record<string, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  arrendado: "Arrendado",
  pausado: "Pausado",
  archivado: "Archivado",
};

const ESTADO_CUENTA: Record<string, string> = {
  pendiente: "Pendiente",
  activo: "Activo",
  suspendido: "Suspendido",
};

const TIPO_MOVIMIENTO: Record<string, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
};

const DICCIONARIOS = {
  categoriaAjuste: CATEGORIA_AJUSTE,
  tipoCalculo: TIPO_CALCULO,
  periodicidad: PERIODICIDAD,
  modeloCobro: MODELO_COBRO,
  ciclo: CICLO,
  marcoLegal: MARCO_LEGAL,
  ambitoRol: AMBITO_ROL,
  rol: ROL,
  ambitoGasto: AMBITO_GASTO,
  ambitoIncidencia: AMBITO_INCIDENCIA,
  responsable: RESPONSABLE,
  prioridad: PRIORIDAD,
  aplicaA: APLICA_A,
  modoRequisito: MODO_REQUISITO,
  estadoUnidad: ESTADO_UNIDAD,
  estadoCuenta: ESTADO_CUENTA,
  tipoMovimiento: TIPO_MOVIMIENTO,
} as const;

export type Diccionario = keyof typeof DICCIONARIOS;

/**
 * Traduce un código a texto legible.
 *
 * Si el código no está en el diccionario se devuelve tal cual en vez de un
 * hueco: una fila nueva creada desde la administración es preferible verla con
 * su slug a no verla.
 */
export function etiqueta(diccionario: Diccionario, codigo: string | null | undefined): string {
  if (codigo === null || codigo === undefined || codigo === "") return "—";
  return DICCIONARIOS[diccionario][codigo] ?? codigo;
}

/** Las opciones de un diccionario, para llenar un `<select>`. */
export function opciones(diccionario: Diccionario): Array<[string, string]> {
  return Object.entries(DICCIONARIOS[diccionario]);
}
