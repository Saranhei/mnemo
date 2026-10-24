import Foundation

/// Tipo de palabra. Determina el color de la tarjeta (ver `Palette` y docs/COLORES.md).
///
/// Se guarda como `String` (rawValue) en la base para que agregar casos nuevos
/// en el futuro no rompa datos ya sincronizados.
enum WordKind: String, CaseIterable, Codable, Identifiable, Sendable {
    case noun
    case verb
    case adjective
    case phrase
    case character
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .noun: "Sustantivo"
        case .verb: "Verbo"
        case .adjective: "Adjetivo"
        case .phrase: "Frase / expresión"
        case .character: "Letra / carácter"
        case .other: "Otro"
        }
    }

    /// Ícono SF Symbol. El color nunca es la única pista (accesibilidad para daltonismo).
    var symbol: String {
        switch self {
        case .noun: "cube.fill"
        case .verb: "bolt.fill"
        case .adjective: "paintpalette.fill"
        case .phrase: "text.quote"
        case .character: "character"
        case .other: "circle.hexagongrid.fill"
        }
    }
}

/// Género gramatical (opcional, útil en idiomas como alemán, francés, ruso...).
enum GrammaticalGender: String, CaseIterable, Codable, Identifiable, Sendable {
    case masculine
    case feminine
    case neuter

    var id: String { rawValue }

    var label: String {
        switch self {
        case .masculine: "Masculino"
        case .feminine: "Femenino"
        case .neuter: "Neutro"
        }
    }

    var symbol: String {
        switch self {
        case .masculine: "m.circle.fill"
        case .feminine: "f.circle.fill"
        case .neuter: "n.circle.fill"
        }
    }
}
