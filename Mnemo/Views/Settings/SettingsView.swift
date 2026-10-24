import SwiftUI

/// Claves de `UserDefaults` (preferencias locales de cada dispositivo).
/// Nunca se guardan datos sensibles acá: solo preferencias de la interfaz.
enum SettingsKeys {
    static let focusMinutes = "pomodoro.focusMinutes"
    static let shortBreakMinutes = "pomodoro.shortBreakMinutes"
    static let longBreakMinutes = "pomodoro.longBreakMinutes"
    static let cyclesBeforeLongBreak = "pomodoro.cyclesBeforeLongBreak"
    static let notificationsEnabled = "pomodoro.notificationsEnabled"
    static let quickNoteDeckID = "quickNote.deckID"
}

struct SettingsView: View {
    @AppStorage(SettingsKeys.focusMinutes) private var focusMinutes = 25
    @AppStorage(SettingsKeys.shortBreakMinutes) private var shortBreakMinutes = 5
    @AppStorage(SettingsKeys.longBreakMinutes) private var longBreakMinutes = 15
    @AppStorage(SettingsKeys.cyclesBeforeLongBreak) private var cycles = 4
    @AppStorage(SettingsKeys.notificationsEnabled) private var notificationsEnabled = true

    var body: some View {
        NavigationStack {
            Form {
                Section("Pomodoro") {
                    Stepper("Foco: \(focusMinutes) min", value: $focusMinutes, in: 5...90, step: 5)
                    Stepper("Descanso corto: \(shortBreakMinutes) min", value: $shortBreakMinutes, in: 1...30)
                    Stepper("Descanso largo: \(longBreakMinutes) min", value: $longBreakMinutes, in: 5...60, step: 5)
                    Stepper("Descanso largo cada \(cycles) pomodoros", value: $cycles, in: 2...8)
                    Toggle("Avisar al terminar cada fase", isOn: $notificationsEnabled)
                }

                Section {
                    ICloudStatusRow()
                } header: {
                    Text("Sincronización")
                } footer: {
                    Text("Tus mazos, tarjetas y sesiones se guardan en tu iCloud privado. Nadie más (ni el desarrollador) puede verlos.")
                }

                Section("Colores de las tarjetas") {
                    ForEach(WordKind.allCases) { kind in
                        Label {
                            Text(kind.label)
                        } icon: {
                            Image(systemName: kind.symbol)
                                .foregroundStyle(Palette.ink)
                                .frame(width: 28, height: 28)
                                .background(kind.color, in: RoundedRectangle(cornerRadius: 6))
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Ajustes")
        }
    }
}

/// Muestra si hay una cuenta de iCloud activa en el dispositivo.
private struct ICloudStatusRow: View {
    @State private var isSignedIn = FileManager.default.ubiquityIdentityToken != nil

    var body: some View {
        Label {
            VStack(alignment: .leading) {
                Text(isSignedIn ? "iCloud activo" : "iCloud no disponible")
                Text(isSignedIn
                     ? "Los cambios se sincronizan solos entre tus dispositivos."
                     : "Iniciá sesión en iCloud en Ajustes del sistema. Mientras tanto, todo se guarda en este dispositivo.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: isSignedIn ? "checkmark.icloud.fill" : "xmark.icloud.fill")
                .foregroundStyle(isSignedIn ? Palette.good : Palette.again)
        }
        .onAppear {
            isSignedIn = FileManager.default.ubiquityIdentityToken != nil
        }
    }
}
