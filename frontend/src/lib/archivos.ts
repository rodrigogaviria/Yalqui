import { api, mensajeDeError } from "./api";

/**
 * Abre un archivo guardado (una factura, un comprobante) en otra pestaña.
 *
 * La ventana se abre en el mismo instante del clic y solo después se le pone
 * la dirección, cuando el servidor ya la firmó: los navegadores bloquean un
 * `window.open` que llega después de esperar una respuesta, porque ya no lo
 * reconocen como consecuencia del clic. Debe llamarse directo desde el
 * manejador del clic, antes de cualquier `await`.
 */
export function abrirArchivo(archivoId: number): void {
  const ventana = window.open("", "_blank");
  if (ventana) ventana.opener = null;

  void api.archivos.urlDescarga.query({ archivoId })
    .then(({ url }) => {
      if (ventana) ventana.location.href = url;
      else window.location.href = url;
    })
    .catch((e) => {
      ventana?.close();
      window.alert(mensajeDeError(e));
    });
}
