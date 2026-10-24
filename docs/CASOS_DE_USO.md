# Casos de uso

Actor principal: **Estudiante** (el usuario de la app). Actor secundario: **iCloud**
(sincroniza los datos entre los dispositivos del mismo usuario).

| ID | Caso de uso | Pantalla | Código principal |
|---|---|---|---|
| CU-01 | Crear / editar un mazo | Mazos | `DecksView`, `DeckEditorView` |
| CU-02 | Agregar / editar / borrar tarjetas | Detalle del mazo | `DeckDetailView`, `CardEditorView` |
| CU-03 | Repasar tarjetas (sistema Anki) | Repaso | `ReviewView`, `SM2Scheduler` |
| CU-04 | Escuchar la pronunciación | Repaso | `Speaker` |
| CU-05 | Usar el Pomodoro | Pomodoro | `PomodoroView`, `PomodoroTimer` |
| CU-06 | Anotar palabras durante una sesión | Pomodoro | `QuickNoteView`, `StudySession` |
| CU-07 | Recuperar una sesión desde otro dispositivo | Sesiones | `SessionsView`, `Persistence` |
| CU-08 | Importar un mazo (de Anki o de esta app) | Mazos | `DeckTransfer.load` |
| CU-09 | Exportar / compartir un mazo | Detalle del mazo | `ExportSheet`, `DeckTransfer` |
| CU-10 | Configurar el Pomodoro | Ajustes | `SettingsView` |
| CU-11 | Ver el estado de iCloud | Ajustes | `ICloudStatusRow` |

---

## CU-01 · Crear / editar un mazo

**Objetivo:** agrupar tarjetas por tema (ej. "Hiragana", "Verbos de alemán").

1. En **Mazos**, tocar **+**.
2. Escribir el nombre y elegir el idioma que se estudia (se usa para la voz).
3. Tocar **Guardar**. El mazo aparece en la lista y en todos los dispositivos.

- Editar: dentro del mazo → **⋯ ▸ Editar mazo**.
- Borrar: deslizar la fila (iPhone/iPad) o clic derecho (Mac) → confirmación.
  **Borra también sus tarjetas, en todos los dispositivos.**

**Validaciones:** el nombre no puede quedar vacío; se recorta a 100 caracteres.

## CU-02 · Agregar / editar / borrar tarjetas

1. Dentro de un mazo, tocar **+**.
2. Completar **Palabra** (frente) y **Significado** (obligatorios); opcionalmente
   **Pronunciación** y **Ejemplo**.
3. Elegir el **Tipo** (sustantivo, verbo, adjetivo, frase, letra/carácter, otro).
   La vista previa muestra el color que tendrá la tarjeta.
4. Si es sustantivo, elegir opcionalmente el **Género** (franja de color lateral).
5. **Guardar**. Con "Seguir agregando" activado, el formulario se limpia para cargar varias seguidas.

- Editar: tocar una tarjeta de la lista.
- Borrar: deslizar la fila.
- Buscar: barra de búsqueda (busca en palabra y significado).

**Validaciones:** campos recortados a 1000 caracteres, sin caracteres de control.

## CU-03 · Repasar tarjetas (sistema Anki)

**Precondición:** el mazo tiene tarjetas vencidas (las nuevas vencen al crearse).

1. En el mazo, tocar **Estudiar N tarjetas**.
2. Se muestra el frente de la tarjeta, con el color de su tipo.
3. El estudiante intenta recordar y toca **Mostrar respuesta** (o barra espaciadora).
4. Se muestra significado, pronunciación y ejemplo.
5. Califica con uno de 4 botones (o teclas **1–4**). Debajo de cada botón se ve
   cuándo volverá a aparecer la tarjeta:
   - **Otra vez** → en 10 minutos (y vuelve al final de la cola de esta sesión).
   - **Difícil** → intervalo un poco mayor.
   - **Bien** → 1 día, luego 6, luego multiplica.
   - **Fácil** → salta más lejos.
6. Al terminar la cola aparece **¡Listo por ahora!**

**Reglas:** máximo 200 tarjetas por sesión. Detalle del algoritmo en
[ARQUITECTURA.md](ARQUITECTURA.md#algoritmo-de-repaso-sm-2).

## CU-04 · Escuchar la pronunciación

Durante el repaso, con la respuesta visible, tocar el parlante (o tecla **P**).
Usa las voces del sistema para el idioma del mazo. Si el dispositivo no tiene
esa voz instalada, se puede descargar en *Ajustes ▸ Accesibilidad ▸ Contenido leído*.

## CU-05 · Usar el Pomodoro

1. Ir a **Pomodoro** y tocar **Empezar** (o barra espaciadora).
2. Corre un bloque de **foco** (25 min por defecto). El aro rojo coral muestra el avance.
3. Al terminar, suena una notificación (si se dio permiso) y la fase pasa a
   **descanso corto** (verde). Cada 4 focos, **descanso largo**.
4. Controles: **Pausar/Seguir**, **Saltar** (no cuenta el foco), **Reiniciar**.

**Notas:**
- El tiempo se calcula con la hora de fin, así que es exacto aunque la app vaya a segundo plano.
- El temporizador es de cada dispositivo (no se sincroniza); la sesión sí.
- Si se cierra la app por completo, el temporizador se reinicia, pero la notificación ya programada llega igual.

## CU-06 · Anotar palabras durante una sesión

1. En **Pomodoro**, tocar **Empezar sesión** (o simplemente **Empezar** el
   temporizador: si no hay sesión abierta, se crea una).
2. En **Anotar palabra**, elegir el mazo destino (por defecto, un mazo
   "Anotaciones" que se crea solo), el tipo, escribir palabra y significado → **Anotar**
   (o Enter dos veces).
3. La palabra aparece en "Anotadas en esta sesión", se crea como tarjeta en el
   mazo (lista para repasar) y queda vinculada a la sesión.
4. Cada bloque de foco completado suma 1 🍅 a la sesión.
5. **Terminar** cierra la sesión.

## CU-07 · Recuperar una sesión desde otro dispositivo

**Precondición:** ambos dispositivos con la misma cuenta de iCloud y la capacidad iCloud activada (ver README).

1. Anotar palabras en el dispositivo A (por ejemplo el iPad).
2. Abrir la app en el dispositivo B (por ejemplo el iPhone o la Mac).
3. En **Sesiones** aparecen todas las sesiones, con fecha, pomodoros y palabras.
   Una sesión abierta se marca **En curso** y también aparece en la pestaña Pomodoro
   de B, donde se puede seguir anotando.
4. Tocar una sesión muestra sus palabras y a qué mazo fueron.

**Flujo alternativo — sin iCloud:** todo se guarda localmente y se sincroniza
cuando el usuario inicie sesión en iCloud. Ajustes muestra el estado.
**Borrar una sesión** no borra sus palabras (siguen en sus mazos).

## CU-08 · Importar un mazo

1. En **Mazos**, tocar **Importar** y elegir un archivo:
   - `.json` exportado por esta app, o
   - `.txt` / `.tsv` exportado por Anki (*Archivo ▸ Exportar ▸ Notas en texto plano*):
     una tarjeta por línea, `frente⇥reverso⇥pronunciación⇥ejemplo`.
2. Se crea un mazo nuevo con las tarjetas, sin progreso previo.

**Errores posibles (se muestran al usuario):** archivo > 5 MB, más de 20.000
tarjetas, formato inválido, versión más nueva, sin tarjetas válidas.
Las etiquetas HTML de Anki (`<b>`, `<br>`) se limpian.

## CU-09 · Exportar / compartir un mazo

1. Dentro del mazo → **⋯ ▸ Exportar / compartir**.
2. Tocar **Compartir archivo** → AirDrop, Archivos, Mail, etc.

Exporta palabras, no el progreso de repaso. Sirve como respaldo o para pasárselo a otra persona.

## CU-10 · Configurar el Pomodoro

En **Ajustes ▸ Pomodoro**: duración de foco (5–90 min), descanso corto (1–30),
descanso largo (5–60), cada cuántos focos va el largo (2–8), y avisos on/off.
Son preferencias de cada dispositivo.

## CU-11 · Ver el estado de iCloud

En **Ajustes ▸ Sincronización** se ve si hay una cuenta de iCloud activa.
