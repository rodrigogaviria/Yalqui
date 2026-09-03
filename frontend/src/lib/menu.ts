import type { Rol } from "./roles";

/**
 * Qué ve cada rol al entrar.
 *
 * Sale de los mockups: cuatro menús, cuatro mundos. La diferencia no está en el
 * diseño sino en el alcance — cada rol manda sobre algo distinto, y lo que no
 * aparece importa tanto como lo que sí. Por eso no hay un menú único con ítems
 * escondidos: hay menús distintos.
 */

export type Icono =
  | "grafico" | "cuadros" | "documento" | "tarjeta" | "hoja" | "globo"
  | "triangulo" | "engranaje" | "casa" | "gente" | "llave" | "calendario";

export interface SubOpcion {
  clave: string;
  titulo: string;
}

export interface Opcion {
  /** El identificador de vista que entiende la aplicación. */
  clave: string;
  titulo: string;
  icono: Icono;
  /** Sin construir todavía: se muestra apagada en vez de mentir con un enlace
   *  que no lleva a ninguna parte. */
  pendiente?: boolean;
  /** Se despliegan bajo la opción, en vertical, cuando está activa. */
  sub?: SubOpcion[];
}

/**
 * Las secciones de la configuración del sistema.
 *
 * Se despliegan en el menú lateral en vez de vivir en una fila de pestañas: son
 * diez, y en horizontal la última no cabía sin desplazar la barra, así que
 * media configuración quedaba fuera de vista.
 */
export const SECCIONES_ADMIN: SubOpcion[] = [
  { clave: "geografia", titulo: "Geografía" },
  { clave: "tipos", titulo: "Tipos de inmuebles" },
  { clave: "servicios", titulo: "Servicios adicionales" },
  { clave: "movimientos", titulo: "Ingresos y egresos" },
  { clave: "incidencias", titulo: "Incidencias" },
  { clave: "requisitos", titulo: "Requisitos y documentos" },
  { clave: "plantillas", titulo: "Plantillas de contrato" },
  { clave: "proveedores", titulo: "Proveedores" },
  { clave: "comercial", titulo: "Planes y servicios" },
  { clave: "parametros", titulo: "Parámetros" },
  { clave: "usuarios", titulo: "Usuarios y roles" },
];

export interface Perspectiva {
  rol: Rol;
  titulo: string;
  /** Sobre qué manda este rol. Va bajo el nombre, como en el mockup. */
  alcance: string;
  opciones: Opcion[];
}

const PROPIETARIO: Perspectiva = {
  rol: "propietario",
  titulo: "Propietario",
  alcance: "Sus inmuebles",
  opciones: [
    { clave: "dashboard", titulo: "Dashboard", icono: "grafico" },
    { clave: "portafolio", titulo: "Portafolio", icono: "cuadros" },
    { clave: "aplicaciones", titulo: "Interesados", icono: "documento" },
    { clave: "pagos", titulo: "Pagos", icono: "tarjeta" },
    { clave: "contratos", titulo: "Contratos", icono: "hoja" },
    { clave: "comunicados", titulo: "Comunicados", icono: "globo" },
    { clave: "incidencias", titulo: "Incidencias", icono: "triangulo" },
    { clave: "rentabilidad", titulo: "Rentabilidad", icono: "grafico" },
    { clave: "plan", titulo: "Mi plan Yalqui", icono: "engranaje" },
  ],
};

const INQUILINO: Perspectiva = {
  rol: "inquilino",
  titulo: "Inquilino",
  alcance: "Su contrato",
  opciones: [
    { clave: "inicio", titulo: "Inicio", icono: "casa", pendiente: true },
    { clave: "mis-pagos", titulo: "Mis pagos", icono: "tarjeta", pendiente: true },
    { clave: "mi-score", titulo: "Mi score", icono: "grafico", pendiente: true },
    { clave: "mi-contrato", titulo: "Mi contrato", icono: "hoja", pendiente: true },
    { clave: "reportar", titulo: "Reportar algo", icono: "triangulo", pendiente: true },
    { clave: "avisos", titulo: "Avisos", icono: "globo", pendiente: true },
    { clave: "vecinos", titulo: "Pedir ayuda a un vecino", icono: "globo", pendiente: true },
  ],
};

const ADMIN_INMUEBLE: Perspectiva = {
  rol: "administrador_inmueble",
  titulo: "Administrador de inmueble",
  alcance: "Una comunidad",
  opciones: [
    { clave: "dashboard-edificio", titulo: "Dashboard", icono: "grafico", pendiente: true },
    { clave: "pqrs", titulo: "PQRS", icono: "globo", pendiente: true },
    { clave: "areas-comunes", titulo: "Áreas comunes", icono: "cuadros", pendiente: true },
    { clave: "comunicados-edificio", titulo: "Comunicados", icono: "globo", pendiente: true },
    { clave: "personal", titulo: "Personal", icono: "gente", pendiente: true },
    { clave: "visitas", titulo: "Visitas", icono: "calendario", pendiente: true },
  ],
};

const SOCIO: Perspectiva = {
  rol: "socio_propietario",
  titulo: "Socio inversor",
  alcance: "Sus participaciones",
  opciones: [
    { clave: "participaciones", titulo: "Mis participaciones", icono: "cuadros", pendiente: true },
    { clave: "mi-rentabilidad", titulo: "Mi rentabilidad", icono: "grafico", pendiente: true },
    { clave: "contratos-socio", titulo: "Contratos", icono: "hoja", pendiente: true },
    { clave: "documentos", titulo: "Documentos", icono: "documento", pendiente: true },
    { clave: "avisos-socio", titulo: "Avisos", icono: "globo", pendiente: true },
  ],
};

/**
 * La administración de Yalqui no está en los mockups de roles porque no es un
 * rol del producto sino de quien lo opera: no administra inmuebles, administra
 * el sistema con el que otros los administran.
 */
const ADMIN_YALQUI: Perspectiva = {
  rol: "admin_yalqui",
  titulo: "Administración Yalqui",
  alcance: "Todo el sistema",
  opciones: [
    { clave: "admin", titulo: "Configuración", icono: "engranaje", sub: SECCIONES_ADMIN },
    { clave: "portafolio", titulo: "Portafolio", icono: "cuadros" },
  ],
};

/** El orden en que se ofrecen cuando alguien tiene más de un rol. */
const TODAS: Perspectiva[] = [PROPIETARIO, INQUILINO, ADMIN_INMUEBLE, SOCIO, ADMIN_YALQUI];

/**
 * Las perspectivas que le corresponden a estos roles.
 *
 * Una persona puede ser propietaria de una unidad e inquilina de otra, y son
 * dos mundos distintos: mezclar los dos menús mostraría «Portafolio» y «Mi
 * contrato» juntos sin decir cuál es cuál. Por eso se ofrecen como perspectivas
 * entre las que se cambia, no como un menú sumado.
 */
export function perspectivasDe(roles: Array<{ rol: string }>): Perspectiva[] {
  const tiene = new Set(roles.map((r) => r.rol));
  const propias = TODAS.filter((p) => tiene.has(p.rol));

  // Sin ningún rol todavía —una cuenta recién creada— se le ofrece la de
  // propietario: es desde donde se registra la primera unidad, que es
  // justamente lo que otorga el rol.
  return propias.length > 0 ? propias : [PROPIETARIO];
}
