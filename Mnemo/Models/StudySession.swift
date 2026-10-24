import Foundation
import SwiftData

/// Una sesión de estudio: agrupa los Pomodoros hechos y las palabras anotadas
/// durante ese rato. Se sincroniza por iCloud, así que una sesión empezada en el
/// iPad se puede ver (y continuar) desde el iPhone o la Mac.
@Model
final class StudySession {
    var id: UUID = UUID()
    var title: String = ""
    var startedAt: Date = Date.now
    /// `nil` mientras la sesión está abierta.
    var endedAt: Date? = nil
    var pomodorosCompleted: Int = 0

    /// Palabras anotadas en la sesión. Si se borra la sesión, las tarjetas
    /// NO se borran (siguen en su mazo); solo se desvinculan.
    @Relationship(deleteRule: .nullify, inverse: \Card.session)
    var cards: [Card]? = []

    init(title: String = "", startedAt: Date = .now) {
        self.title = title
        self.startedAt = startedAt
    }

    var isOpen: Bool { endedAt == nil }
    var wordCount: Int { cards?.count ?? 0 }
}
