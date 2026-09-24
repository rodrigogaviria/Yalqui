import { useEffect, type ReactNode } from "react";

/** Una ventana emergente: se cierra con Escape, con la X o tocando afuera. */
export function Ventana({ titulo, alCerrar, children }: {
  titulo: string; alCerrar: () => void; children: ReactNode;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alCerrar]);

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(23,18,43,.45)", zIndex: 50,
        display: "grid", placeItems: "center", padding: 16,
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={titulo} className="tarjeta"
        style={{ width: "100%", maxWidth: 560, padding: 22, display: "grid", gap: 16, maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{titulo}</h2>
          <button className="boton fantasma" aria-label="Cerrar"
            style={{ height: 32, width: 32, padding: 0 }} onClick={alCerrar}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
