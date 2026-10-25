# Seguridad y privacidad

## Resumen

- **La app no tiene credenciales, API keys ni tokens en el código.** No hace falta:
  no hay servidor propio. La sincronización usa CloudKit, que autentica con la
  cuenta de Apple ya iniciada en el dispositivo.
- **Los datos del usuario solo viven en su dispositivo y en su iCloud privado.**
  Ni el desarrollador puede leerlos (base *privada* de CloudKit).
- **Sin rastreo, sin analíticas, sin terceros.** El manifiesto de privacidad
  (`PrivacyInfo.xcprivacy`) lo declara.

## Configuración y secretos

| Archivo | ¿Se sube a git? | Contenido |
|---|---|---|
| `Config/Shared.xcconfig` | Sí | Ajustes comunes, sin datos personales |
| `Config/Local.xcconfig.example` | Sí | Plantilla con valores de ejemplo |
| `Config/Local.xcconfig` | **No** (`.gitignore`) | Tu Team ID, prefijo de bundle e iCloud on/off |
| `Config/Mnemo-iCloud-*.entitlements` | Sí | Permisos de iCloud; el contenedor se arma con tu bundle id, sin valores fijos |
| `Mnemo.xcodeproj`, `build/` | **No** | Generados por `scripts/build.sh` |

`scripts/build.sh` no pide, lee ni guarda contraseñas: la firma la hace Xcode
con la cuenta ya iniciada en *Settings → Accounts*.

El `.gitignore` además bloquea los formatos típicos de secretos: `.env`,
certificados (`.p12`, `.p8`, `.pem`, `.cer`), perfiles de aprovisionamiento,
`GoogleService-Info.plist`, `Secrets.swift`.

**Si en el futuro se agrega un servicio que sí necesite una clave** (por ejemplo
una API de traducción):
1. Nunca ponerla en el código ni en `Info.plist` del repositorio: cualquier valor
   dentro de la app compilada se puede extraer.
2. Lo correcto es un backend propio (o una función serverless) que guarde la clave
   y al que la app llame; la app nunca la ve.
3. Si el usuario carga su propia clave, guardarla en el **Llavero (Keychain)**,
   nunca en `UserDefaults`.

Antes de cada commit se puede revisar con:
```bash
git diff --cached | grep -iE "api[_-]?key|secret|token|password|BEGIN (RSA|EC|PRIVATE)"
```

## Datos no confiables (importación)

Todo archivo importado se trata como potencialmente malicioso (`DeckTransfer`):

| Riesgo | Mitigación |
|---|---|
| Archivo gigante que agota memoria | Se rechaza si pesa > 5 MB **antes** de leerlo |
| Millones de tarjetas que llenan iCloud | Máximo 20.000 tarjetas por importación |
| Campos enormes | Cada campo se recorta a 1.000 caracteres; nombres a 100 |
| Caracteres de control / invisibles | Se eliminan (`TextSanitizer.clean`) |
| HTML o scripts | La app nunca interpreta HTML: todo se muestra como texto plano. El HTML de Anki se quita |
| Valores desconocidos (tipo, género) | Se normalizan a valores válidos |
| Versión de formato desconocida | Se rechaza con un mensaje claro |
| Nombre de archivo con rutas (`../`) al exportar | Se filtran a letras, números, `-`, `_` y espacios |
| (Web) Audio/video de un ejercicio de listening | Solo tipos `audio/*` y `video/*`, hasta 60 MB de audio y 90 MB de archivo; se guarda como `Blob` local y se reproduce con un `blob:` URL propio (CSP `media-src 'self' blob:`). Nunca se sube a ningún servidor |
| Acceso a archivos fuera del sandbox | Solo archivos que el usuario elige, con `startAccessingSecurityScopedResource` |

## Plataforma

- **Mac:** App Sandbox + Hardened Runtime activados; solo lectura/escritura de archivos elegidos por el usuario.
- **Protección de datos:** los archivos exportados se escriben con `.completeFileProtection` (cifrados mientras el dispositivo está bloqueado).
- **Logs:** con `os.Logger`; nunca se loguea contenido de tarjetas, solo errores técnicos.
- **Errores:** ninguna operación de guardado se ignora en silencio (`try?`); se registran y, cuando corresponde, se muestran al usuario.
- **Borrados destructivos** (mazo completo) piden confirmación explicando que afecta a todos los dispositivos.

## Buenas prácticas de código aplicadas

- Swift 6 con verificación estricta de concurrencia (`SWIFT_STRICT_CONCURRENCY = complete`).
- Lógica crítica separada de la interfaz y cubierta por tests.
- Dependencias externas: **ninguna** (solo frameworks de Apple), lo que elimina riesgo de cadena de suministro.
- Sin `force unwrap` en la lógica de la app; solo aparece en los datos de ejemplo para las vistas previas de Xcode (`makePreviewContainer` y `#Preview`).
