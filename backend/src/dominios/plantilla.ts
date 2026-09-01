/**
 * Cómo se convierte una plantilla en el contrato que las partes van a firmar.
 *
 * Vive aparte del router porque no toca la base ni la sesión: son funciones
 * puras, y así se pueden probar sin levantar nada.
 */

const UNIDADES = [
  "", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  // «veintiún» y no «veintiuno»: «uno» se apocopa delante de un sustantivo
  // masculino, y acá siempre va delante de «pesos» o de «mil».
  "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés",
  "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];

const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];

const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

function menorDeMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  if (n < 30) return UNIDADES[n]!;
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? DECENAS[d]! : `${DECENAS[d]} y ${UNIDADES[u]}`;
  }
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto === 0 ? CENTENAS[c]! : `${CENTENAS[c]} ${menorDeMil(resto)}`;
}

/**
 * El monto en letras, como lo exige la costumbre notarial colombiana.
 *
 * Solo la parte entera: los contratos de arriendo no llevan centavos, y
 * escribirlos donde nadie los espera se lee como un error.
 */
export function enLetras(monto: number): string {
  const n = Math.floor(Math.abs(monto));
  if (n === 0) return "cero pesos";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "un millón" : `${menorDeMil(millones)} millones`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${menorDeMil(miles)} mil`);
  }
  if (resto > 0) partes.push(menorDeMil(resto));

  // «un millón de pesos», pero «un millón trescientos mil pesos»: la
  // preposición aparece solo cuando «millones» es la última palabra antes de la
  // moneda. Es la diferencia entre contar millones y contar pesos.
  const soloMillones = millones > 0 && miles === 0 && resto === 0;
  return `${partes.join(" ")} ${soloMillones ? "de pesos" : "pesos"}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «21 de julio de 2026», como se escribe en un contrato. */
export function fechaLarga(f: Date | string): string {
  const d = typeof f === "string" ? new Date(`${f}T12:00:00`) : f;
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** «$ 1.300.000», con el separador de miles colombiano. */
export function enPesos(monto: number): string {
  return `$${Math.round(monto).toLocaleString("es-CO")}`;
}

/**
 * Los nombres en castellano con los que se puede escribir una etiqueta.
 *
 * Existen para que pegar un contrato sea escribir <Arrendatario> donde antes
 * decía un nombre, en vez de tener que aprenderse una lista de claves técnicas.
 * Varios nombres apuntan al mismo dato porque la misma cosa se llama distinto
 * según quién redacte: el tomador y el arrendatario son la misma persona.
 */
const ALIAS: Record<string, string> = {
  // Las partes
  "arrendador": "arrendador",
  "propietario": "arrendador",
  "cedula del arrendador": "documento_arrendador",
  "cedula arrendador": "documento_arrendador",
  "documento del arrendador": "documento_arrendador",
  "celular del arrendador": "celular_arrendador",
  "correo del arrendador": "email_arrendador",
  "email del arrendador": "email_arrendador",

  "arrendatario": "arrendatario",
  "tomador": "arrendatario",
  "inquilino": "arrendatario",
  "cedula del arrendatario": "documento_arrendatario",
  "cedula arrendatario": "documento_arrendatario",
  "cedula del tomador": "documento_arrendatario",
  "documento del arrendatario": "documento_arrendatario",
  "celular del arrendatario": "celular_arrendatario",
  "correo del arrendatario": "email_arrendatario",
  "email del arrendatario": "email_arrendatario",

  "coarrendatario": "coarrendatario",
  "codeudor": "coarrendatario",
  "cedula del coarrendatario": "documento_coarrendatario",
  "cedula del codeudor": "documento_coarrendatario",
  "documento del codeudor": "documento_coarrendatario",
  "celular del codeudor": "celular_coarrendatario",
  "celular del coarrendatario": "celular_coarrendatario",
  "correo del codeudor": "email_coarrendatario",
  "correo del coarrendatario": "email_coarrendatario",
  "email del codeudor": "email_coarrendatario",

  // El dinero
  "valor": "canon",
  "canon": "canon",
  "valor del contrato": "canon",
  "valor del arriendo": "canon",
  "canon de arrendamiento": "canon",
  "valor en letras": "canon_letras",
  "canon en letras": "canon_letras",
  "dia de pago": "dia_pago",
  "medio de pago": "medio_pago",
  "penalidad": "penalidad",
  "penalidad en letras": "penalidad_letras",

  // El tiempo
  "fecha": "fecha_firma",
  "fecha de generacion": "fecha_firma",
  "fecha de firma": "fecha_firma",
  "fecha de inicio": "fecha_inicio",
  "fecha de fin": "fecha_fin",
  "fecha de terminacion": "fecha_fin",
  "fecha de entrega": "fecha_entrega",
  "plazo": "meses",
  "meses": "meses",
  "duracion": "meses",
  "incremento": "incremento",

  // El inmueble
  "inmueble": "inmueble",
  "direccion": "direccion",
  "ciudad": "ciudad",
  "barrio": "barrio",
  "area": "area",
  "matricula": "matricula",
  "matricula inmobiliaria": "matricula",
  "servicios": "servicios",
  "mascotas": "mascotas",
};

/**
 * Normaliza el nombre de una etiqueta: sin tildes, en minúsculas y con los
 * separadores unificados.
 *
 * Así <Arrendatario>, <arrendatario> y <ARRENDATARIO> son la misma etiqueta, y
 * quien pega un contrato no tiene que acordarse de cómo la escribió antes.
 */
function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A qué dato apunta una etiqueta, sea cual sea la forma en que se escribió. */
export function claveDe(etiqueta: string): string | null {
  const limpio = normalizar(etiqueta);
  return ALIAS[limpio] ?? (limpio.replace(/ /g, "_") in DATOS_CONOCIDOS ? limpio.replace(/ /g, "_") : null);
}

/** Todo lo que el generador sabe llenar. Se usa para validar y para listar las
 *  etiquetas disponibles en la pantalla de configuración. */
export const DATOS_CONOCIDOS: Record<string, string> = {
  inmueble: "El inmueble, con su tipo y dirección",
  matricula: "Matrícula inmobiliaria",
  direccion: "Dirección",
  barrio: "Barrio",
  ciudad: "Ciudad",
  area: "Área construida en m²",
  arrendador: "Nombre del propietario",
  documento_arrendador: "Cédula del propietario",
  ciudad_arrendador: "Ciudad del propietario",
  celular_arrendador: "Celular del propietario",
  email_arrendador: "Correo del propietario",
  arrendatario: "Nombre del tomador",
  documento_arrendatario: "Cédula del tomador",
  celular_arrendatario: "Celular del tomador",
  email_arrendatario: "Correo del tomador",
  coarrendatario: "Nombre del codeudor",
  documento_coarrendatario: "Cédula del codeudor",
  celular_coarrendatario: "Celular del codeudor",
  email_coarrendatario: "Correo del codeudor",
  canon: "Valor del canon",
  canon_letras: "Valor del canon en letras",
  dia_pago: "Día de pago",
  medio_pago: "Cómo y a dónde se paga",
  incremento: "Fórmula de incremento anual",
  meses: "Plazo en meses",
  fecha_inicio: "Fecha de inicio",
  fecha_fin: "Fecha de terminación",
  fecha_entrega: "Fecha de entrega",
  fecha_firma: "Fecha de generación del contrato",
  penalidad: "Penalidad por daños",
  penalidad_letras: "Penalidad en letras",
  servicios: "Cláusula de servicios incluidos",
  mascotas: "Cláusula de mascotas",
  clausula_coarrendatario: "Cláusula completa del coarrendatario",
  clausula_inquilinos: "Cláusula de quiénes habitan",
  notificacion_coarrendatario: "Notificación al coarrendatario",
  firma_coarrendatario: "Bloque de firma del coarrendatario",
};

/**
 * Reemplaza los marcadores por sus valores.
 *
 * Un marcador sin valor se deja tal cual en vez de vaciarse. Un contrato que
 * dice «{{matricula}}» avisa que falta un dato; uno que dice «identificado con
 * folio de matrícula número .» parece completo y no lo está.
 */
export function renderizar(cuerpo: string, datos: Record<string, string | null | undefined>): {
  texto: string;
  faltantes: string[];
} {
  const faltantes = new Set<string>();

  const resolver = (original: string, etiqueta: string): string => {
    const clave = claveDe(etiqueta);
    if (clave === null) {
      // Etiqueta que el generador no conoce. Se deja tal cual: borrarla haría
      // desaparecer un dato que alguien puso a propósito, sin avisar.
      faltantes.add(etiqueta.trim());
      return original;
    }
    const valor = datos[clave];
    if (valor === null || valor === undefined || valor === "") {
      faltantes.add(clave);
      return original;
    }
    return valor;
  };

  const texto = cuerpo
    // {{clave_tecnica}}, la sintaxis con la que se sembraron las plantillas.
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, resolver)
    // <Nombre en castellano>, la que se usa al pegar un contrato. Se exige que
    // empiece con letra para no tocar nada que parezca HTML ni un signo de
    // «menor que» suelto en el texto.
    .replace(/<\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^<>\n]{0,60})\s*>/g, resolver);

  return { texto, faltantes: [...faltantes] };
}
