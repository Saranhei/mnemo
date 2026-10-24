import Foundation
import SwiftData

/// Un mazo de tarjetas (por ejemplo "Hiragana" o "Verbos en alemán").
///
/// Requisitos de CloudKit que este modelo respeta:
/// - Todas las propiedades tienen valor por defecto o son opcionales.
/// - Las relaciones son opcionales.
/// - No se usa `@Attribute(.unique)` (CloudKit no lo soporta).
@Model
final class Deck {
    var id: UUID = UUID()
    var name: String = ""
    /// Código de idioma BCP-47 de lo que se estudia (p. ej. "ja", "de", "ko").
    /// Se usa para la pronunciación con voz del sistema.
    var languageCode: String = "en"
    var createdAt: Date = Date.now

    /// Al borrar un mazo se borran sus tarjetas.
    @Relationship(deleteRule: .cascade, inverse: \Card.deck)
    var cards: [Card]? = []

    init(name: String, languageCode: String) {
        self.name = name
        self.languageCode = languageCode
    }

    var cardCount: Int { cards?.count ?? 0 }

    func dueCards(at now: Date) -> [Card] {
        (cards ?? [])
            .filter { $0.dueDate <= now }
            .sorted { $0.dueDate < $1.dueDate }
    }

    func dueCount(at now: Date) -> Int {
        (cards ?? []).reduce(0) { $0 + ($1.dueDate <= now ? 1 : 0) }
    }
}
