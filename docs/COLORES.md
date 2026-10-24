# Colores: qué se eligió y por qué

## Lo que dice la evidencia (y lo que no)

Primero, honestidad: **no existe "un color científicamente probado" que haga
memorizar mejor una palabra.** Lo que sí está respaldado por investigación es un
conjunto de principios sobre *cómo usar* el color. La paleta de la app aplica esos
principios, no una promesa mágica.

| Principio | Qué muestra la investigación | Cómo lo aplica la app |
|---|---|---|
| **El color mejora el recuerdo** | Las imágenes a color se recuerdan mejor que en blanco y negro; el color funciona como una pista adicional que se codifica junto con el contenido (Wichmann, Sharpe y Gegenfurtner, 2002; Spence et al., 2006; revisión de Dzulkifli y Mustafar, 2013). | Cada tarjeta tiene un fondo de color pleno, no solo un detalle. |
| **Codificación por color consistente** | Asociar siempre el mismo color a la misma categoría ayuda a organizar y recuperar la información (revisión de Dzulkifli y Mustafar, 2013). Es la base de técnicas difundidas como colorear el género gramatical en alemán. | Un color fijo por tipo de palabra y por género. Nunca cambia. |
| **Colores cálidos captan atención** | Los colores cálidos y saturados (rojo, naranja, amarillo) atraen la atención más que los fríos o apagados; la atención es condición para codificar en memoria (Dzulkifli y Mustafar, 2013). | Los tipos más frecuentes (sustantivo y verbo) usan naranja y coral. |
| **Lo distinto se recuerda más** (efecto von Restorff) | Un elemento que se diferencia de su entorno se recuerda mejor (von Restorff, 1933). | La interfaz es neutra (grises del sistema) y la tarjeta es lo único saturado de la pantalla. |
| **El rojo puede tener doble filo** | Hay estudios donde el rojo mejora tareas de detalle (Mehta y Zhu, 2009) y otros donde, en contextos de evaluación, se asocia a peor rendimiento (Elliot et al., 2007). Algunos de estos efectos no se replicaron de forma consistente (p. ej. Steele, 2014). | No se usa rojo puro de fondo. El "rojo" de la app es un coral suave, y "Otra vez" es un rosa-rojo usado solo en un botón. |
| **La legibilidad manda** | Si el texto no se lee bien, ningún color ayuda. Las pautas WCAG piden contraste ≥ 4.5:1. | Todo texto sobre color usa casi negro (`#1A1A1F`), con contraste ≥ 5.9:1 en todos los fondos. |

**Conclusión práctica:** el beneficio real viene de la **consistencia** (mismo
color = misma categoría), la **distintividad** (la tarjeta resalta) y el
**contraste**. Por eso, además, el color nunca va solo: siempre lo acompaña un
ícono y un texto, para que funcione también con daltonismo.

## La paleta

### Tipo de palabra (fondo de la tarjeta)

| Tipo | Color | Hex | Ícono |
|---|---|---|---|
| Sustantivo | Mandarina | `#FF9F1C` | cubo |
| Verbo | Coral | `#FF5D73` | rayo (acción) |
| Adjetivo | Menta | `#3DDC97` | paleta (cualidad) |
| Frase / expresión | Celeste | `#4CC9F0` | comillas |
| Letra / carácter | Violeta | `#C77DFF` | carácter |
| Otro | Girasol | `#FFD60A` | hexágonos |

### Género gramatical (franja lateral + etiqueta)

| Género | Hex |
|---|---|
| Masculino | `#7B9BFF` (azul) |
| Femenino | `#FF6FB5` (rosa) |
| Neutro | `#B5E550` (verde lima) |

Es la convención más usada en material para aprender alemán, así que si el
estudiante ya la conoce, se refuerza.

### Botones de repaso

| Botón | Hex | Idea |
|---|---|---|
| Otra vez | `#EF476F` | alerta, sin ser rojo agresivo |
| Difícil | `#FFB703` | precaución |
| Bien | `#06D6A0` | éxito |
| Fácil | `#4CC9F0` | calma |

### Pomodoro

Foco = coral `#FF5D73` (activación); descanso = menta `#3DDC97` (calma).

## Cambiar colores

Todo está en `Mnemo/Theme/Palette.swift`. Si cambiás un color, verificá el contraste
del texto en un verificador WCAG (por ejemplo el de WebAIM) con el texto `#1A1A1F`.

## Referencias

- Dzulkifli, M. A., y Mustafar, M. F. (2013). The influence of colour on memory performance: a review. *Malaysian Journal of Medical Sciences, 20*(2), 3–9.
- Wichmann, F. A., Sharpe, L. T., y Gegenfurtner, K. R. (2002). The contributions of color to recognition memory for natural scenes. *Journal of Experimental Psychology: Learning, Memory, and Cognition, 28*(3), 509–520.
- Spence, I., Wong, P., Rusan, M., y Rastegar, N. (2006). How color enhances visual memory for natural scenes. *Psychological Science, 17*(1), 1–6.
- von Restorff, H. (1933). Über die Wirkung von Bereichsbildungen im Spurenfeld. *Psychologische Forschung, 18*, 299–342.
- Mehta, R., y Zhu, R. (2009). Blue or red? Exploring the effect of color on cognitive task performances. *Science, 323*(5918), 1226–1229.
- Elliot, A. J., Maier, M. A., Moller, A. C., Friedman, R., y Meinhardt, J. (2007). Color and psychological functioning: the effect of red on performance attainment. *Journal of Experimental Psychology: General, 136*(1), 154–168.
- Steele, K. M. (2014). Failure to replicate the Mehta and Zhu (2009) color-priming effect on anagram solution times. *Psychonomic Bulletin & Review, 21*(3), 771–776.
- W3C. Web Content Accessibility Guidelines (WCAG) 2.2 — criterio 1.4.3, Contraste (mínimo).
