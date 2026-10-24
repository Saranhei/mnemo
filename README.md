# Mnemo — flashcards para aprender idiomas

App nativa para **iPhone, iPad y Mac** (un solo código en SwiftUI) para estudiar
alfabetos, caracteres y vocabulario de otros idiomas con **repetición espaciada
estilo Anki**, tarjetas con **colores por tipo de palabra**, **Pomodoro** y
**sesiones de estudio sincronizadas por iCloud**.

| Funcionalidad | Dónde está |
|---|---|
| Mazos y tarjetas (palabra, significado, pronunciación, ejemplo, tipo, género) | `Views/Decks/` |
| Repaso tipo Anki con 4 botones y algoritmo SM-2 | `Views/Review/`, `Services/SM2Scheduler.swift` |
| Colores por tipo de palabra y género gramatical | `Theme/Palette.swift`, [docs/COLORES.md](docs/COLORES.md) |
| Pomodoro configurable con aviso al terminar | `Views/Pomodoro/`, `Services/PomodoroTimer.swift` |
| Sesiones de estudio con palabras anotadas, sincronizadas entre dispositivos | `Models/StudySession.swift`, `Views/Sessions/` |
| Importar mazos de Anki (.txt) y exportar/compartir (.json) | `Services/DeckTransfer.swift` |
| Pronunciación con voz del sistema (sin internet) | `Services/Speaker.swift` |

> **¿Sin Mac o sin cuenta de Apple Developer?** Usá la **versión web** (`web/`):
> se publica gratis y se instala desde Safari en iPhone y iPad, con los mismos
> mazos, colores, repaso y Pomodoro. Guía: [web/README.md](web/README.md).

**No usa servidores propios ni API keys.** Los datos viven en el dispositivo y en
el iCloud privado del usuario. Ver [docs/SEGURIDAD.md](docs/SEGURIDAD.md).

## Documentación

- [docs/CASOS_DE_USO.md](docs/CASOS_DE_USO.md) — qué puede hacer el usuario, paso a paso.
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — cómo está organizado el código y cómo funciona cada parte.
- [docs/COLORES.md](docs/COLORES.md) — la paleta y la evidencia científica detrás (con sus límites).
- [docs/SEGURIDAD.md](docs/SEGURIDAD.md) — manejo de credenciales, datos e importaciones.
- [docs/WEB.md](docs/WEB.md) — cómo funciona la versión web (PWA) y en qué difiere de la nativa.

---

## Requisitos

- Una Mac con **Xcode 16 o superior** (gratis en la Mac App Store), abierto al menos una vez.
- Tu **Apple ID** agregado en Xcode → **Settings → Accounts → +**.
  - **Cuenta gratuita:** podés instalar en tu Mac, iPhone y iPad, pero **sin
    sincronización por iCloud** y en iPhone/iPad la app deja de abrir a los 7 días
    (se reinstala corriendo el script de nuevo).
  - **Apple Developer Program (pago anual):** iCloud entre dispositivos y la app dura un año.
- Sistemas: iOS / iPadOS 18+, macOS 15+.

## Instalar en Mac, iPhone y iPad (camino rápido)

Todo se hace con `scripts/build.sh`, que genera el proyecto de Xcode, compila,
firma con tu cuenta e instala. **No pide ni guarda contraseñas.**

Abrí la app **Terminal**, entrá a la carpeta del proyecto (escribí `cd ` y
arrastrá la carpeta `Mnemo` a la ventana) y seguí estos pasos:

**1. Primera corrida (crea tu archivo de configuración)**
```bash
./scripts/build.sh mac
```
La primera vez crea `Config/Local.xcconfig` y se detiene. Si no tenés
[Homebrew](https://brew.sh), instalalo antes: el script lo usa para instalar XcodeGen.

**2. Completá `Config/Local.xcconfig`** (no se sube a git):
- `DEVELOPMENT_TEAM`: tu Team ID. Lo ves con `./scripts/build.sh team`.
- `BUNDLE_ID_PREFIX`: algo único tuyo, por ejemplo `com.mishu`.
- `MNEMO_ICLOUD`: `YES` solo si tenés la cuenta paga; si no, `NO`.

**3. Instalar en la Mac**
```bash
./scripts/build.sh mac
```
Queda en **Aplicaciones → Mnemo**.

**4. Instalar en iPhone y iPad**
1. Conectá el dispositivo por cable, desbloquealo y tocá **Confiar**.
2. En el dispositivo: **Ajustes → Privacidad y seguridad → Modo de desarrollador** → activar (se reinicia).
3. Corré:
   ```bash
   ./scripts/build.sh ios            # todos los conectados
   ./scripts/build.sh ios "iPad de Mishu"   # uno en particular
   ```
4. La primera vez, en el dispositivo: **Ajustes → General → VPN y gestión de
   dispositivos → tu Apple ID → Confiar**.

Después del primer emparejamiento también instala por Wi-Fi (misma red).
`./scripts/build.sh all` hace Mac + iPhone/iPad de una.

**Otros comandos:** `./scripts/build.sh test` (tests), `./scripts/build.sh open`
(abre el proyecto en Xcode para editar). Si algo falla, el script explica el
error más probable y deja el log completo en `build/xcodebuild.log`.

### Sincronización por iCloud

Con `MNEMO_ICLOUD = YES`, el script pide los permisos de iCloud y Xcode crea
solo el contenedor `iCloud.<tu bundle id>`. Para probarla, instalá en dos
dispositivos con la **misma cuenta de iCloud**. Los cambios tardan unos segundos
(o hasta que la app vuelva a primer plano).

> El identificador del contenedor de iCloud no es una credencial: es un nombre
> público. El acceso real lo da la cuenta de Apple de cada usuario.

### Antes de publicar en App Store / TestFlight

En [CloudKit Console](https://icloud.developer.apple.com) → tu contenedor →
**Deploy Schema Changes to Production**. Si no, la sincronización funciona en
desarrollo pero no en la versión publicada. Con la cuenta paga, TestFlight
permite instalar en tus dispositivos sin cable y sin vencimiento semanal.

## Estructura

```
Mnemo/
├── App/            Entrada de la app y creación del almacenamiento (SwiftData + iCloud)
├── Models/         Deck, Card, StudySession, WordKind (modelos de datos)
├── Services/       Lógica sin interfaz: SM-2, Pomodoro, notificaciones, import/export, voz, logs
├── Theme/          Paleta de colores
├── Views/          Pantallas SwiftUI (Mazos, Repaso, Pomodoro, Sesiones, Ajustes)
└── Resources/      Ícono, colores y manifiesto de privacidad
MnemoTests/         Tests del algoritmo, del Pomodoro y de la importación
Config/             Configuración de build y permisos de iCloud (Local.xcconfig NO se sube)
scripts/build.sh    Compila e instala en Mac / iPhone / iPad
project.yml         Definición del proyecto de Xcode (lo usa XcodeGen)
docs/               Documentación
```

## Si algo no compila

El código está escrito para Swift 6 con concurrencia estricta. Si tu versión de
Xcode marca algún error, copiá el mensaje y la línea: suelen ser ajustes de una
línea (por ejemplo un `@MainActor` de más o de menos).
