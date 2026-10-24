import Foundation
import os

/// Loggers centralizados.
///
/// Regla de privacidad: **nunca** se loguea el contenido de las tarjetas ni
/// datos del usuario; solo errores técnicos. `Logger` oculta por defecto los
/// valores interpolados en los logs de producción salvo que se marquen `.public`.
enum Log {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "Mnemo"

    static let persistence = Logger(subsystem: subsystem, category: "persistence")
    static let transfer = Logger(subsystem: subsystem, category: "transfer")
    static let pomodoro = Logger(subsystem: subsystem, category: "pomodoro")
}
