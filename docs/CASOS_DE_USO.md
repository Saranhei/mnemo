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

---

# Versión web: Práctica

| ID | Caso de uso | Pantalla | Código principal |
|---|---|---|---|
| CU-12 | Practicar la escritura de un kana o kanji | Práctica → Escritura | `views/practice/writing.js`, `core/strokes.js` |
| CU-13 | Crear, importar o generar un cuestionario | Práctica → Preguntas | `views/practice/quizzes.js`, `core/transfer.js` |
| CU-14 | Responder un cuestionario escribiendo | Práctica → Preguntas | `runQuiz`, `core/japanese.js` |
| CU-15 | Practicar pronunciación | Práctica → Pronunciación | `views/practice/audio.js`, `services/voice.js` |
| CU-16 | Reconocer palabras de oído | Práctica → ¿Qué escuchaste? | `views/practice/audio.js` |
| CU-17 | Cargar un ejercicio de listening | Práctica → Listening → Nuevo ejercicio | `views/practice/listening.js` |
| CU-18 | Practicar listening | Práctica → Listening → Practicar | `views/practice/listening.js`, `core/listening.js` |
| CU-19 | Armar listas de kanji propias | Práctica → Escritura → Nueva lista / Diccionario | `ui/kanjiLists.js`, `data/store.js` |
| CU-20 | Escribir kanji de memoria | Práctica → Kanji de memoria | `views/practice/kanjiRecall.js` |
| CU-21 | Buscar en el diccionario | Diccionario | `views/dictionary.js`, `core/dictionary.js` |

## CU-12 · Practicar la escritura

1. En **Práctica → Escritura**, elegir el **idioma** (por ahora solo japonés; la lista está preparada para sumar otros) y el conjunto: hiragana, katakana (con o sin ゛゜), una de tus listas de kanji (CU-19) o los kanji de un mazo.
2. Tocar un carácter (o **Practicar en orden** / **Al azar**).
3. Se muestra la animación del orden de trazos, con el número de cada uno, y se escucha cómo se lee.
4. Dibujar los trazos en orden con el dedo o el Apple Pencil. Vale aunque la letra salga más chica, corrida o un poco torcida: la app se adapta a tu tamaño de letra después del primer trazo. Cada trazo correcto queda en color; uno incorrecto se marca en rojo y se explica por qué (posición u orden, o dirección invertida). Después de dos errores en el mismo trazo, se muestra cuál era.
5. Al terminar bien, el carácter queda dibujado en verde, aparece un tick grande y la app pasa sola al siguiente (1,4 s). Si hubo que repetir, "Repetilo" y queda en el mismo para reintentar. **Siguiente**, **Anterior** o **Reintentar** cancelan el salto automático.

Opciones: **Guía** (mostrar u ocultar el carácter de fondo), **Ver trazos**, **Escuchar**, **Reintentar**, **Pasar solo al siguiente** (apagalo para quedarte mirando cómo quedó) y **Mostrar los trazos al abrir** (apagalo para que no te muestre el carácter antes de intentarlo). Si levantás el dedo a mitad de un trazo que va de un tirón, la app espera la otra parte y te avisa. Teclado: espacio = animación, ← → = anterior/siguiente.
**Sin conexión:** los kana siempre; un kanji, si ya se practicó alguna vez con internet.

## CU-13 · Crear un cuestionario

- **Nuevo:** nombre (por ejemplo "Genki L3") y después **Pregunta** para agregar de a una: la pregunta, las respuestas válidas (una por línea) y una nota opcional.
- **Importar texto:** pegar o elegir un archivo con una pregunta por línea: `pregunta⇥respuesta1 / respuesta2⇥nota`. Sirve copiar dos o tres columnas de una planilla.
- **Desde un mazo:** elegir el mazo y qué hay que escribir (la palabra en japonés o el significado). Se crea una pregunta por tarjeta; después se puede editar.

## CU-14 · Responder un cuestionario

1. **Practicar**: las preguntas salen en orden aleatorio.
2. Escribir la respuesta y **Comprobar** (Enter). Se acepta kana, kanji o romaji, sin importar mayúsculas, tildes ni espacios.
3. Se muestra si está bien y la respuesta esperada. **No sé** muestra la respuesta.
4. Las falladas vuelven al final. El resumen muestra cuántas estuvieron bien a la primera y cuáles repasar.

## CU-15 · Practicar pronunciación

1. Elegir mazo y cantidad. Se muestra la palabra (kanji, lectura y significado).
2. **Escuchar modelo** reproduce la voz japonesa del sistema.
3. Según dónde se use:
   - **Safari / Chrome:** **Decirlo** → se escucha al usuario y se indica si se entendió la palabra y qué se escuchó.
   - **App instalada en iPhone/iPad** (Apple no permite el reconocimiento ahí): tocar el campo y usar el micrófono del teclado japonés; o **Grabarme**, escuchar la grabación junto al modelo y marcar **Me salió bien** o **Repetir**.

Se acepta si el reconocimiento escribió otro kanji que se lee igual (翻 por 本) o con vocales más largas o cortas; si falla un solo sonido (ほ por ほん) dice **¡Casi!** y qué sonido marcar más.

**Privacidad:** el reconocimiento automático lo hace el navegador (Apple o Google) y puede enviar el audio a sus servidores; "Grabarme" no envía nada.

## CU-16 · Reconocer palabras de oído

- **¿Qué escuchaste?:** se escucha la palabra y se elige el significado entre cuatro opciones (teclas 1–4).

Si falta la voz japonesa en el dispositivo, la app indica cómo descargarla.

## CU-17 · Cargar un ejercicio de listening

1. **Práctica → Listening → Nuevo ejercicio** (o **Agregar ejemplos** para tener tres de prueba: fácil, medio y difícil).
2. Completar: título, nivel (fácil / medio / difícil), idioma.
3. **Subir audio o video** (mp3, m4a, wav, mp4, mov; hasta 60 MB). Queda guardado solo en este dispositivo. Sin archivo, la app lee el texto con la voz del sistema, frase por frase.
4. **Transcripción** (obligatoria). Para elegir los espacios a completar, poner las palabras entre corchetes: `私は[学生]です`; otra respuesta válida va con `|`: `[学生|がくせい]`. Sin corchetes, la app elige los espacios según el nivel (fácil: pocos; difícil: muchos).
5. **Lectura en kana** (opcional): si la transcripción tiene kanji, permite corregir un dictado escrito en kana.
6. **Preguntas de comprensión** (opcional): una por línea, `pregunta⇥respuesta1 / respuesta2`.
7. **Exportar** genera un archivo `.mnemo-listening.json` con el audio adentro, para pasarlo a otro dispositivo o a otra persona; se abre con **Ajustes → Importar**.

## CU-18 · Practicar listening

1. **Practicar** abre el reproductor: play/pausa, −5 s (o frase anterior/siguiente con la voz del sistema), y velocidad 0,5× · 0,75× · 1×.
2. Elegir el ejercicio:
   - **Completar espacios:** se escribe cada palabra que falta. Al comprobar, las correctas quedan en verde y las incorrectas en rojo con la respuesta como pista.
   - **Preguntas:** se responden las preguntas de comprensión (aparece solo si el ejercicio tiene).
   - **Dictado completo:** se escribe todo el texto siguiendo el audio lento. La app muestra el porcentaje y marca en rojo lo que faltó. **Ver transcripción** muestra el texto.
3. En todos se acepta kana, kanji o romaji (las partículas `wa`, `e`, `o` cuentan como は, へ, を).

## CU-19 · Armar listas de kanji propias

1. En **Práctica → Escritura**, **Nueva lista**: nombre y los kanji (escritos o pegados; de un texto quedan solo los kanji, sin repetir).
2. Con la lista elegida: **Agregar kanji** para sumar los que vas aprendiendo, **Editar lista** para renombrar, quitar kanji o borrarla.
3. Desde el **Diccionario**, en la ficha de un kanji: **Agregar a mis kanji** → elegir la lista (o crear una).
4. Las listas aparecen en Escritura y en Kanji de memoria, y viajan en la copia de seguridad.

Para Genki I hay un archivo aparte con una lista por lección (L3–L12) y una con todos: se abre con **Ajustes → Importar**.

## CU-20 · Escribir kanji de memoria

1. **Práctica → Kanji de memoria**: elegir de dónde (una lista o los kanji de un mazo), cuántos (10, 20, todos) y el orden (primero los que más cuestan, al azar o el de la lista).
2. Se muestra el significado y las lecturas on (celeste) y kun (verde). Escribir el kanji en la cuadrícula vacía. La corrección es trazo por trazo y más permisiva que en Escritura.
3. **Pista** muestra el trazo que sigue; **No me acuerdo** muestra el kanji entero para copiarlo; **Borrar** empieza de nuevo; **Saltar** pasa al siguiente.
4. Al completarlo aparece un sello: ◎ perfecto, ○ con errores, △ con ayuda, y pasa solo al siguiente.
5. Resumen: precisión, lista con el sello de cada kanji y **Repetir los que costaron**.

## CU-21 · Buscar en el diccionario

1. Pestaña **Diccionario**. Escribir en kanji (食べる), kana (たべる), romaji (taberu) o el significado (comer, to eat).
2. Si la búsqueda tiene kanji, arriba aparecen sus fichas; abajo, las palabras (las comunes primero). "EN" = solo tiene traducción al inglés.
3. Tocar una palabra: lecturas, categoría, todas las acepciones (español e inglés), sus kanji, **Escuchar**, **Agregar a un mazo** (como tarjeta) y enlaces a **Takoboto** y **Jisho**.
4. Tocar un kanji: significado, lecturas, trazos, nivel JLPT aproximado, palabras de ejemplo, **Practicar escritura** y **Agregar a mis kanji**.

**Sin conexión:** la primera vez se descarga (~1,7 MB); después funciona sin internet.
