import Foundation

/// Respuesta del usuario al ver la respuesta de una tarjeta (los 4 botones tipo Anki).
enum ReviewGrade: Int, CaseIterable, Identifiable, Sendable {
    case again = 1
    case hard
    case good
    case easy

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .again: "Otra vez"
        case .hard: "Difícil"
        case .good: "Bien"
        case .easy: "Fácil"
        }
    }

    /// Atajo de teclado (Mac / iPad con teclado): 1, 2, 3, 4.
    var shortcut: Character {
        Character(String(rawValue))
    }
}

/// Estado de repaso de una tarjeta, independiente de SwiftData para poder testearlo.
struct SchedulingState: Equatable, Sendable {
    var intervalDays: Double
    var ease: Double
    var repetitions: Int
    var lapses: Int
    var dueDate: Date
}

/// Algoritmo de repetición espaciada basado en **SM-2** (SuperMemo 2, Wozniak 1987),
/// el mismo en el que se basa Anki, adaptado a 4 botones.
///
/// Idea: cada vez que recordás bien una tarjeta, el intervalo hasta el próximo
/// repaso se multiplica por su "facilidad" (ease). Si la olvidás, vuelve a empezar.
///
/// | Botón     | Efecto en ease | Próximo intervalo                                    |
/// |-----------|----------------|------------------------------------------------------|
/// | Otra vez  | −0.20          | 10 minutos; se reinician las repeticiones            |
/// | Difícil   | −0.15          | intervalo × 1.2 (mínimo 1 día)                       |
/// | Bien      | sin cambio     | 1 día → 6 días → intervalo × ease                    |
/// | Fácil     | +0.15          | 4 días la primera vez, luego intervalo × ease × 1.3 |
///
/// La ease nunca baja de 1.3 (para que una tarjeta difícil no quede "atrapada").
/// Es un tipo puro: recibe `now` como parámetro, así los tests son deterministas.
struct SM2Scheduler: Sendable {
    static let initialEase = 2.5

    var minimumEase = 1.3
    var relearnDelay: TimeInterval = 10 * 60
    var hardMultiplier = 1.2
    var easyBonus = 1.3
    var maximumIntervalDays = 3650.0

    private static let secondsPerDay: TimeInterval = 86_400

    func schedule(_ state: SchedulingState, grade: ReviewGrade, now: Date) -> SchedulingState {
        var next = state

        switch grade {
        case .again:
            next.repetitions = 0
            next.lapses += 1
            next.ease = max(minimumEase, state.ease - 0.20)
            next.intervalDays = 0
            next.dueDate = now.addingTimeInterval(relearnDelay)
            return next

        case .hard:
            next.ease = max(minimumEase, state.ease - 0.15)
            next.intervalDays = state.repetitions == 0 ? 1 : state.intervalDays * hardMultiplier

        case .good:
            switch state.repetitions {
            case 0: next.intervalDays = 1
            case 1: next.intervalDays = 6
            default: next.intervalDays = state.intervalDays * state.ease
            }

        case .easy:
            next.ease = state.ease + 0.15
            next.intervalDays = state.repetitions == 0
                ? 4
                : state.intervalDays * state.ease * easyBonus
        }

        next.repetitions = state.repetitions + 1
        next.intervalDays = min(maximumIntervalDays, max(1, next.intervalDays.rounded()))
        next.dueDate = now.addingTimeInterval(next.intervalDays * Self.secondsPerDay)
        return next
    }

    /// Texto corto para mostrar debajo de cada botón ("10 min", "6 d", "2 mes").
    func previewLabel(for state: SchedulingState, grade: ReviewGrade, now: Date) -> String {
        let next = schedule(state, grade: grade, now: now)
        return Self.format(interval: next.dueDate.timeIntervalSince(now))
    }

    static func format(interval: TimeInterval) -> String {
        let minutes = interval / 60
        if minutes < 60 { return "\(max(1, Int(minutes.rounded()))) min" }
        let days = interval / secondsPerDay
        if days < 1 { return "\(Int((minutes / 60).rounded())) h" }
        if days < 30 { return "\(Int(days.rounded())) d" }
        if days < 365 { return "\(Int((days / 30).rounded())) mes" }
        return String(format: "%.1f años", days / 365)
    }
}
