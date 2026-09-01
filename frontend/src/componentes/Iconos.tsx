import type { Icono } from "../lib/menu";

/**
 * Los iconos del menú, tomados de los mockups.
 *
 * Van en línea y no como fuente de iconos: son doce trazos, y una dependencia
 * externa para eso costaría más de lo que ahorra. El color se hereda con
 * `currentColor` para que el ítem activo no necesite un segundo juego.
 */
const TRAZOS: Record<Icono, React.ReactNode> = {
  grafico: (
    <>
      <path d="M3.2 14.5 7 9.6l3.2 2.7 3.4-5.1 3 2.4" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.2 3.4v13.2h13.4" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
    </>
  ),
  cuadros: (
    <>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.4" strokeWidth="1.7" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.4" strokeWidth="1.7" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.4" strokeWidth="1.7" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.4" strokeWidth="1.7" />
    </>
  ),
  documento: (
    <path d="M4 3.5h9l3.5 3.5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  tarjeta: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" strokeWidth="1.6" />
      <path d="M2.5 8.5h15" strokeWidth="1.6" />
    </>
  ),
  hoja: (
    <path d="M11.6 2.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.4l-3.9-3.9Z" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  globo: (
    <path d="M3 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3v-3H5a2 2 0 0 1-2-2v-6Z" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  triangulo: (
    <path d="M10 2.5 17.5 16H2.5L10 2.5Z" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  engranaje: (
    <>
      <circle cx="10" cy="10" r="2.4" strokeWidth="1.6" />
      <path d="M10 3v2.2M10 14.8V17M3 10h2.2M14.8 10H17" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  casa: (
    <path d="M3.6 9.6 10 4.2l6.4 5.4v7a.8.8 0 0 1-.8.8H4.4a.8.8 0 0 1-.8-.8v-7Z" strokeWidth="1.7" strokeLinejoin="round" />
  ),
  gente: (
    <>
      <circle cx="7.5" cy="7" r="2.6" strokeWidth="1.6" />
      <path d="M2.8 16.5c0-2.6 2.1-4.2 4.7-4.2s4.7 1.6 4.7 4.2" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.4 5.2a2.5 2.5 0 0 1 0 4.6M14.6 12.6c1.6.5 2.7 1.8 2.7 3.9" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </>
  ),
  llave: (
    <>
      <circle cx="7" cy="7" r="3.2" strokeWidth="1.6" />
      <path d="M9.4 9.4 16 16M13.6 13.6l1.6-1.6" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  calendario: (
    <>
      <rect x="2.8" y="4.2" width="14.4" height="13" rx="1.6" strokeWidth="1.6" />
      <path d="M2.8 8.2h14.4M6.6 2.6v3M13.4 2.6v3" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
};

export function IconoMenu({ nombre }: { nombre: Icono }) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      aria-hidden="true" style={{ flexShrink: 0 }}>
      {TRAZOS[nombre]}
    </svg>
  );
}
