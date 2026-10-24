# Mnemo web: instalarla en iPhone, iPad, Android o computadora

Versión web de Mnemo. Hace lo mismo que la app nativa (mazos, repaso tipo Anki,
colores por tipo de palabra, Pomodoro, sesiones), pero no necesita Xcode, ni una
Mac, ni una cuenta de Apple Developer. Se publica una vez en internet y después
se instala desde Safari como si fuera una app: tiene su ícono, se abre a pantalla
completa y funciona sin conexión.

> **Ya publicada en:** <https://saranhei.github.io/mnemo/>. Se actualiza sola con
> cada push a `main` que toque `web/` (ver `.github/workflows/pages.yml`): corre las
> pruebas, arma la app y la publica. Si una prueba falla, no se publica nada.

## 1. Publicarla en otro lado (opcional)

Lo que se publica es la carpeta **`mnemo-web`** que viene en el zip `Mnemo-web-para-publicar.zip`
(o la carpeta `dist/` si la armás vos con `npm run build`).

### Opción recomendada: Netlify Drop (sin instalar nada)

1. Entrá a <https://app.netlify.com/drop> y creá una cuenta gratis (podés usar Google o GitHub).
   Sin cuenta el sitio queda temporal y protegido con contraseña; con la cuenta queda publicado y es tuyo.
2. Descomprimí el zip y **arrastrá la carpeta `mnemo-web`** al recuadro de la página.
3. En unos segundos te da una dirección del tipo `https://nombre-raro-123.netlify.app`.
   Podés cambiarla en *Site configuration → Change site name* (por ejemplo `mnemo-mishu`).

Las cabeceras de seguridad (archivo `_headers`) se aplican solas en Netlify.

### Alternativas

- **Cloudflare Pages**: *Workers & Pages → Create → Pages → Upload assets* y subís la misma carpeta.
- **GitHub Pages**: subís el contenido de la carpeta a un repositorio y activás *Settings → Pages*.
  Ahí no se aplican las cabeceras de `_headers`, pero la página ya trae su propia política de seguridad.

> La app tiene que servirse por **https** (los tres servicios lo hacen). Sin https,
> el navegador no permite el modo sin conexión ni la instalación.

## 2. Instalarla en el iPhone o el iPad

1. Abrí la dirección en **Safari** (en iPhone/iPad tiene que ser Safari).
2. Tocá el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elegí **Agregar a pantalla de inicio** → **Agregar**.
4. Abrila desde el ícono nuevo. Desde ese momento funciona sin internet.

En **Android** (Chrome): menú ⋮ → *Instalar app*. En la **computadora** (Chrome o Edge):
el ícono de instalar en la barra de direcciones. En Mac con Safari: *Archivo → Agregar al Dock*.

**Importante en iPhone/iPad:** los datos de la app instalada viven dentro de esa app.
Si la borrás de la pantalla de inicio, se borran sus datos. Exportá una copia antes
(Ajustes → Exportar copia).

## 3. Pasar las palabras de un dispositivo a otro

No hay servidor ni cuentas, así que nadie más ve tus datos. La sincronización se hace con un archivo:

1. En el dispositivo donde anotaste: **Ajustes → Exportar copia** → AirDrop al otro
   (o guardala en iCloud Drive).
2. En el otro: **Ajustes → Importar copia o mazo** → elegí el archivo.

Se **combina** con lo que ya hay: de cada tarjeta y sesión queda la versión más
nueva, y lo borrado en un dispositivo también se borra en el otro. Podés hacerlo
en los dos sentidos y las veces que quieras.

También importa mazos de Anki (*Archivo → Exportar → Notas en texto plano*, .txt) y
los .json exportados por la app nativa.

## 4. Limitaciones frente a la app nativa

| | Web | Nativa |
|---|---|---|
| Sincronización | Manual, con archivo (AirDrop) | Automática por iCloud (requiere cuenta paga de Apple) |
| Aviso del Pomodoro con la app cerrada | No: el celular pausa las apps web en segundo plano. Por eso mantiene la pantalla encendida mientras corre | Sí, con notificación |
| Instalación | Desde Safari, sin Mac ni cuenta | Con Xcode y una Mac |

## 5. Para desarrollar

Requiere Node 20 o más nuevo. No usa dependencias externas en la app.

```bash
npm test                     # pruebas de la lógica (SM-2, Pomodoro, importación, sincronización)
npm run build                # arma dist/ (para publicar) y dist-preview/
npm run serve                # sirve dist/ en http://localhost:5173 con las cabeceras de producción
node tests/e2e.mjs capturas  # prueba en navegador real (requiere: npm i -D playwright)
```

Cada vez que cambies algo, corré `npm run build` y volvé a subir `dist/`. Los
dispositivos instalados toman la versión nueva la próxima vez que abran la app
con internet.

Estructura y funcionamiento del código: [`../docs/WEB.md`](../docs/WEB.md).
