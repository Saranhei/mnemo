import SwiftUI
import SwiftData
import Combine

/// Pomodoro + sesión de estudio.
///
/// - El reloj circular muestra la fase (foco / descanso) con su color.
/// - "Empezar sesión" crea una `StudySession` que se sincroniza por iCloud:
///   las palabras anotadas acá quedan guardadas en la sesión y en el mazo elegido,
///   y aparecen en los otros dispositivos.
struct PomodoroView: View {
    @Environment(PomodoroTimer.self) private var timer
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase

    @Query(
        filter: #Predicate<StudySession> { $0.endedAt == nil },
        sort: \StudySession.startedAt,
        order: .reverse
    )
    private var openSessions: [StudySession]

    @AppStorage(SettingsKeys.focusMinutes) private var focusMinutes = 25
    @AppStorage(SettingsKeys.shortBreakMinutes) private var shortBreakMinutes = 5
    @AppStorage(SettingsKeys.longBreakMinutes) private var longBreakMinutes = 15
    @AppStorage(SettingsKeys.cyclesBeforeLongBreak) private var cycles = 4
    @AppStorage(SettingsKeys.notificationsEnabled) private var notificationsEnabled = true

    @State private var now = Date.now
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    /// La sesión abierta más reciente (puede haberse abierto en otro dispositivo).
    private var activeSession: StudySession? { openSessions.first }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    clock
                    controls
                    sessionSection
                }
                .padding()
                .frame(maxWidth: 700)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Pomodoro")
        }
        .onReceive(ticker) { date in
            now = date
            timer.tick(now: date)
        }
        .onChange(of: scenePhase) { _, _ in
            now = .now
            timer.tick(now: now)
        }
        .onAppear(perform: applySettings)
        .onChange(of: settingsSignature) { _, _ in applySettings() }
        .onChange(of: timer.completedFocusCount) { oldValue, newValue in
            guard newValue > oldValue, let session = activeSession else { return }
            session.pomodorosCompleted += 1
            save()
        }
    }

    // MARK: Reloj

    private var clock: some View {
        let remaining = timer.remaining(at: now)
        return ZStack {
            Circle()
                .stroke(timer.phase.color.opacity(0.2), lineWidth: 18)
            Circle()
                .trim(from: 0, to: timer.progress(at: now))
                .stroke(timer.phase.color, style: StrokeStyle(lineWidth: 18, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 1), value: now)
            VStack(spacing: 6) {
                Text(timer.phase.title)
                    .font(.headline)
                    .foregroundStyle(timer.phase.color)
                Text(Self.format(remaining))
                    .font(.system(size: 64, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text("Pomodoros completados: \(timer.completedFocusCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 280, height: 280)
        .accessibilityElement(children: .combine)
    }

    private var controls: some View {
        HStack(spacing: 16) {
            Button("Reiniciar", systemImage: "arrow.counterclockwise") { timer.reset() }
                .buttonStyle(.bordered)

            Button {
                if timer.isRunning {
                    timer.pause()
                } else {
                    startTimer()
                }
            } label: {
                Label(timer.isRunning ? "Pausar" : (timer.isPaused ? "Seguir" : "Empezar"),
                      systemImage: timer.isRunning ? "pause.fill" : "play.fill")
                    .font(.title3.bold())
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(timer.phase.color)
            .foregroundStyle(Palette.ink)
            .keyboardShortcut(.space, modifiers: [])

            Button("Saltar", systemImage: "forward.end.fill") { timer.skip() }
                .buttonStyle(.bordered)
        }
        .labelStyle(.titleAndIcon)
    }

    // MARK: Sesión

    @ViewBuilder
    private var sessionSection: some View {
        if let session = activeSession {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Sesión en curso").font(.headline)
                        Text("Desde \(session.startedAt.formatted(date: .omitted, time: .shortened)) · \(session.wordCount) palabras · \(session.pomodorosCompleted) 🍅")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Terminar") { end(session) }
                        .buttonStyle(.bordered)
                }
                QuickNoteView(session: session)
            }
            .padding()
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else {
            VStack(spacing: 12) {
                Text("Empezá una sesión para anotar palabras mientras estudiás. Se guardan en iCloud y las recuperás desde cualquier dispositivo.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                Button("Empezar sesión", systemImage: "note.text.badge.plus") { startSession() }
                    .buttonStyle(.borderedProminent)
                    .tint(Palette.sky)
                    .foregroundStyle(Palette.ink)
            }
            .padding()
        }
    }

    // MARK: Acciones

    private func startTimer() {
        if notificationsEnabled {
            Task { await PomodoroNotifications.requestAuthorization() }
        }
        if activeSession == nil && timer.phase == .focus {
            startSession()
        }
        timer.start()
    }

    private func startSession() {
        context.insert(StudySession(startedAt: .now))
        save()
    }

    private func end(_ session: StudySession) {
        session.endedAt = .now
        save()
    }

    private func save() {
        do {
            try context.save()
        } catch {
            Log.persistence.error("Error al guardar sesión: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: Ajustes

    private var settingsSignature: [Int] {
        [focusMinutes, shortBreakMinutes, longBreakMinutes, cycles, notificationsEnabled ? 1 : 0]
    }

    private func applySettings() {
        timer.durations = .init(
            focus: TimeInterval(focusMinutes * 60),
            shortBreak: TimeInterval(shortBreakMinutes * 60),
            longBreak: TimeInterval(longBreakMinutes * 60),
            cyclesBeforeLongBreak: cycles
        )
        timer.notificationsEnabled = notificationsEnabled
    }

    static func format(_ interval: TimeInterval) -> String {
        let total = Int(interval.rounded(.up))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}
