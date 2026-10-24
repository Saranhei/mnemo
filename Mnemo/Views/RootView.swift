import SwiftUI

/// Navegación principal.
/// `.sidebarAdaptable` muestra pestañas abajo en iPhone y una barra lateral en iPad y Mac,
/// con un solo código.
struct RootView: View {
    var body: some View {
        TabView {
            Tab("Mazos", systemImage: "rectangle.stack.fill") {
                DecksView()
            }
            Tab("Pomodoro", systemImage: "timer") {
                PomodoroView()
            }
            Tab("Sesiones", systemImage: "clock.arrow.circlepath") {
                SessionsView()
            }
            Tab("Ajustes", systemImage: "gearshape.fill") {
                SettingsView()
            }
        }
        .tabViewStyle(.sidebarAdaptable)
    }
}

#Preview {
    RootView()
        .environment(PomodoroTimer())
        .modelContainer(Persistence.makePreviewContainer())
}
