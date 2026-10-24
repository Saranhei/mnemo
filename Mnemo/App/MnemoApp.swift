import SwiftUI
import SwiftData

/// Punto de entrada de la app (iPhone, iPad y Mac comparten este mismo código).
///
/// - Crea el contenedor de datos (SwiftData, sincronizado con iCloud si está disponible).
/// - Crea un único temporizador Pomodoro compartido por toda la app, para que
///   siga corriendo aunque el usuario cambie de pestaña.
@main
struct MnemoApp: App {
    @State private var pomodoro = PomodoroTimer()
    private let container = Persistence.makeContainer()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(pomodoro)
        }
        .modelContainer(container)
    }
}
