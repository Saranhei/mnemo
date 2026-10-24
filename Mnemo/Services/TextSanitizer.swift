import Foundation

/// Limpieza y validación de todo texto que entra a la app (formularios e importaciones).
///
/// Por qué: los archivos importados son datos no confiables. Limitar largos evita
/// archivos que agoten memoria o llenen la cuota de iCloud, y quitar caracteres
/// de control evita texto invisible o que rompa la interfaz.
/// La app nunca interpreta el texto como HTML ni código: siempre se muestra como texto plano.
enum TextSanitizer {
    static let maxFieldLength = 1_000
    static let maxNameLength = 100

    /// Recorta espacios, quita caracteres de control (salvo saltos de línea) y limita el largo.
    static func clean(_ text: String, maxLength: Int = maxFieldLength) -> String {
        // Solo se quitan caracteres de control (categoría Cc) y marcas que alteran la
        // dirección del texto. Se conservan ZWJ/ZWNJ, necesarios en emojis, persa, hindi, etc.
        let bidiOverrides: ClosedRange<UInt32> = 0x202A...0x202E
        let bidiIsolates: ClosedRange<UInt32> = 0x2066...0x2069
        let allowed = text.unicodeScalars.filter { scalar in
            if scalar == "\n" { return true }
            if scalar.properties.generalCategory == .control { return false }
            if bidiOverrides.contains(scalar.value) || bidiIsolates.contains(scalar.value) || scalar.value == 0xFEFF { return false }
            return true
        }
        let trimmed = String(String.UnicodeScalarView(allowed))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String(trimmed.prefix(maxLength))
    }

    /// Quita etiquetas HTML simples (los .txt exportados por Anki pueden traer `<br>`, `<b>`, etc.).
    static func stripHTML(_ text: String) -> String {
        text
            .replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "<[^>]{1,200}>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
    }
}
