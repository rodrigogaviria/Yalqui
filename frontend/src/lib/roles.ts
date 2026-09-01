/** Los siete roles del modelo, en el mismo orden que los define el backend. */
export const ROLES = [
  "admin_yalqui", "administrador_inmueble", "propietario",
  "socio_propietario", "inquilino", "personal_propiedad", "proveedor",
] as const;

export type Rol = (typeof ROLES)[number];
