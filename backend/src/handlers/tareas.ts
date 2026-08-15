export interface Tarea {
  id: number;
  titulo: string;
}

const tareas: Tarea[] = [];
let siguienteId = 1;

export function crear(titulo: string): Tarea {
  const nuevaTarea: Tarea = { id: siguienteId++, titulo };
  tareas.push(nuevaTarea);
  return nuevaTarea;
}

export function listar(): Tarea[] {
  return tareas;
}