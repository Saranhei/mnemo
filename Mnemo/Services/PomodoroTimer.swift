import Foundation
import Observation

/// Temporizador Pomodoro: foco → descanso corto → foco ... → descanso largo.
///
/// Diseño clave: en vez de restar 1 segundo con un `Timer` (lo que se desfasa
/// cuando la app pasa a segundo plano), se guarda la **hora de fin** (`endDate`)
/// y el tiempo restante se calcula como `endDate - ahora`. Así el conteo es
/// correcto aunque el sistema suspenda la app. Una notificación local avisa al
/// terminar cada fase si la app no está en pantalla.
///
/// El estado del temporizador vive en memoria (no se sincroniza): un Pomodoro
/// es algo de un dispositivo. Lo que sí se sincroniza es la `StudySession`.
@MainActor
@Observable
final class PomodoroTimer {
    enum Phase: String, Sendable {
        case focus
        case shortBreak
        case longBreak

        var title: String {
            switch self {
            case .focus: "Foco"
            case .shortBreak: "Descanso corto"
            case .longBreak: "Descanso largo"
            }
        }
    }

    struct Durations: Equatable, Sendable {
        var focus: TimeInterval = 25 * 60
        var shortBreak: TimeInterval = 5 * 60
        var longBreak: TimeInterval = 15 * 60
        var cyclesBeforeLongBreak = 4
    }

    var durations = Durations()
    var notificationsEnabled = true

    private(set) var phase: Phase = .focus
    private(set) var endDate: Date?
    private(set) var pausedRemaining: TimeInterval?
    /// Cantidad de bloques de foco terminados (la vista lo observa para sumar a la sesión).
    private(set) var completedFocusCount = 0

    var isRunning: Bool { endDate != nil }
    var isPaused: Bool { pausedRemaining != nil }

    func duration(of phase: Phase) -> TimeInterval {
        switch phase {
        case .focus: durations.focus
        case .shortBreak: durations.shortBreak
        case .longBreak: durations.longBreak
        }
    }

    func remaining(at now: Date) -> TimeInterval {
        if let endDate { return max(0, endDate.timeIntervalSince(now)) }
        if let pausedRemaining { return pausedRemaining }
        return duration(of: phase)
    }

    /// 0 al empezar, 1 al terminar.
    func progress(at now: Date) -> Double {
        let total = duration(of: phase)
        guard total > 0 else { return 0 }
        return min(1, max(0, 1 - remaining(at: now) / total))
    }

    func start(now: Date = .now) {
        guard endDate == nil else { return }
        let total = pausedRemaining ?? duration(of: phase)
        pausedRemaining = nil
        let end = now.addingTimeInterval(total)
        endDate = end
        if notificationsEnabled {
            let nextTitle = phase == .focus ? "¡Bloque de foco terminado!" : "Fin del descanso"
            let body = phase == .focus ? "Tomate un descanso. Buen trabajo." : "Volvamos a estudiar."
            Task { await PomodoroNotifications.schedule(at: end, title: nextTitle, body: body) }
        }
    }

    func pause(now: Date = .now) {
        guard let endDate else { return }
        pausedRemaining = max(0, endDate.timeIntervalSince(now))
        self.endDate = nil
        PomodoroNotifications.cancel()
    }

    /// Pasa a la siguiente fase sin contar el foco como completado.
    func skip() {
        advance(countingFocus: false)
    }

    /// Vuelve al inicio de un bloque de foco.
    func reset() {
        endDate = nil
        pausedRemaining = nil
        phase = .focus
        PomodoroNotifications.cancel()
    }

    /// Llamado periódicamente por la vista. Si la fase terminó, avanza.
    func tick(now: Date) {
        guard let endDate, now >= endDate else { return }
        advance(countingFocus: true)
    }

    private func advance(countingFocus: Bool) {
        if phase == .focus {
            if countingFocus { completedFocusCount += 1 }
            let cycles = max(1, durations.cyclesBeforeLongBreak)
            let isLong = countingFocus && completedFocusCount % cycles == 0
            phase = isLong ? .longBreak : .shortBreak
        } else {
            phase = .focus
        }
        endDate = nil
        pausedRemaining = nil
        PomodoroNotifications.cancel()
    }
}
