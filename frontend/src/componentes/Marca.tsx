export function Marca({ tamano = 26 }: { tamano?: number }) {
  return (
    <span
      style={{
        fontFamily: '"Kufam", "Trebuchet MS", sans-serif',
        fontSize: tamano,
        fontWeight: 700,
        color: "var(--violeta)",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      yalqui
    </span>
  );
}
