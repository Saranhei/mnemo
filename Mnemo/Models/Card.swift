import Foundation
import SwiftData

/// Una tarjeta (flashcard): una palabra/carácter y su significado, más el estado
/// de repaso espaciado (algoritmo SM-2, ver `SM2Scheduler`).
@Model
final class Card {
    var id: UUID = UUID()

    // MARK: Contenido
    /// Lo que se muestra primero (la palabra en el idioma estudiado).
    var front: String = ""
    /// La respuesta (significado / traducción).
    var back: String = ""
    var pronunciation: String = ""
    var example: String = ""
    /// Guardado como texto; usar la propiedad calculada `kind`.
    var kindRaw: String = WordKind.other.rawValue
    var genderRaw: String? = nil
    var createdAt: Date = Date.now

    // MARK: Repaso espaciado
    /// Cuándo toca repasarla. Una tarjeta nueva vence en el momento de crearse.
    var dueDate: Date = Date.now
    var intervalDays: Double = 0
    var ease: Double = SM2Scheduler.initialEase
    var repetitions: Int = 0
    var lapses: Int = 0
    var lastReviewedAt: Date? = nil

    // MARK: Relaciones (la inversa está declarada en Deck / StudySession)
    var deck: Deck? = nil
    /// Sesión de estudio en la que se anotó la palabra (si se anotó durante un Pomodoro).
    var session: StudySession? = nil

    init(
        front: String,
        back: String,
        pronunciation: String = "",
        example: String = "",
        kind: WordKind = .other,
        gender: GrammaticalGender? = nil
    ) {
        self.front = front
        self.back = back
        self.pronunciation = pronunciation
        self.example = example
        self.kindRaw = kind.rawValue
        self.genderRaw = gender?.rawValue
    }

    var kind: WordKind {
        get { WordKind(rawValue: kindRaw) ?? .other }
        set { kindRaw = newValue.rawValue }
    }

    var gender: GrammaticalGender? {
        get { genderRaw.flatMap(GrammaticalGender.init(rawValue:)) }
        set { genderRaw = newValue?.rawValue }
    }

    /// Puente entre el modelo persistido y el algoritmo (que es puro y testeable).
    var schedulingState: SchedulingState {
        get {
            SchedulingState(
                intervalDays: intervalDays,
                ease: ease,
                repetitions: repetitions,
                lapses: lapses,
                dueDate: dueDate
            )
        }
        set {
            intervalDays = newValue.intervalDays
            ease = newValue.ease
            repetitions = newValue.repetitions
            lapses = newValue.lapses
            dueDate = newValue.dueDate
        }
    }

    var isNew: Bool { lastReviewedAt == nil }
}
