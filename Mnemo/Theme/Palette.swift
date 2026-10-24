import SwiftUI

/// Paleta de la app. El porqué de cada color está en docs/COLORES.md.
///
/// Reglas que sigue:
/// 1. **Un color por categoría y siempre el mismo** (codificación por color):
///    el cerebro asocia el color con el tipo de palabra y lo usa como pista extra.
/// 2. **Colores cálidos y saturados** para lo que hay que memorizar (atraen la atención);
///    la interfaz alrededor es neutra para que la tarjeta "resalte" (efecto de aislamiento).
/// 3. **Contraste alto**: texto oscuro (`ink`) sobre colores vivos, ≥ 4.5:1 (WCAG AA).
/// 4. **El color nunca va solo**: siempre acompaña un ícono y un texto (daltonismo).
enum Palette {
    // MARK: Tipo de palabra
    static let tangerine = Color(hex: 0xFF9F1C)   // sustantivo
    static let coral = Color(hex: 0xFF5D73)       // verbo
    static let mint = Color(hex: 0x3DDC97)        // adjetivo
    static let sky = Color(hex: 0x4CC9F0)         // frase
    static let violet = Color(hex: 0xC77DFF)      // letra / carácter
    static let sunflower = Color(hex: 0xFFD60A)   // otro

    // MARK: Género gramatical
    static let masculine = Color(hex: 0x7B9BFF)
    static let feminine = Color(hex: 0xFF6FB5)
    static let neuter = Color(hex: 0xB5E550)

    // MARK: Botones de repaso
    static let again = Color(hex: 0xEF476F)
    static let hard = Color(hex: 0xFFB703)
    static let good = Color(hex: 0x06D6A0)
    static let easy = Color(hex: 0x4CC9F0)

    // MARK: Pomodoro
    static let focus = Color(hex: 0xFF5D73)
    static let rest = Color(hex: 0x3DDC97)

    /// Texto sobre fondos de color vivo (casi negro, contraste ≥ 5.9:1 con todos los de arriba).
    static let ink = Color(hex: 0x1A1A1F)
}

extension Color {
    /// Color a partir de un valor hexadecimal 0xRRGGBB (sRGB).
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

extension WordKind {
    var color: Color {
        switch self {
        case .noun: Palette.tangerine
        case .verb: Palette.coral
        case .adjective: Palette.mint
        case .phrase: Palette.sky
        case .character: Palette.violet
        case .other: Palette.sunflower
        }
    }
}

extension GrammaticalGender {
    var color: Color {
        switch self {
        case .masculine: Palette.masculine
        case .feminine: Palette.feminine
        case .neuter: Palette.neuter
        }
    }
}

extension ReviewGrade {
    var color: Color {
        switch self {
        case .again: Palette.again
        case .hard: Palette.hard
        case .good: Palette.good
        case .easy: Palette.easy
        }
    }
}

extension PomodoroTimer.Phase {
    var color: Color { self == .focus ? Palette.focus : Palette.rest }
}
