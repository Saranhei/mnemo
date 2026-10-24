import Foundation
import UserNotifications

/// Notificaciones locales del Pomodoro (no usan internet ni servidores push).
enum PomodoroNotifications {
    private static let identifier = "pomodoro.phase.end"

    /// Pide permiso una sola vez; si el usuario lo niega, el Pomodoro sigue
    /// funcionando, solo que sin aviso en segundo plano.
    @discardableResult
    static func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound])
        } catch {
            Log.pomodoro.error("Permiso de notificaciones falló: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    static func schedule(at date: Date, title: String, body: String) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let interval = max(1, date.timeIntervalSinceNow)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)

        do {
            try await UNUserNotificationCenter.current().add(request)
        } catch {
            Log.pomodoro.error("No se pudo programar la notificación: \(error.localizedDescription, privacy: .public)")
        }
    }

    static func cancel() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    }
}
