/** El logo de yalqui. `tamano` conserva la escala que ya usaban las pantallas:
 *  la imagen es unas dos veces más alta que el texto que reemplaza porque
 *  lleva la casita encima. */
export function Marca({ tamano = 26 }: { tamano?: number }) {
  return (
    <img
      src="/logo.png"
      alt="yalqui"
      style={{ height: Math.round(tamano * 2.1), width: "auto", display: "block" }}
    />
  );
}
