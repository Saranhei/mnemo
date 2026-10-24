import SwiftUI
import SwiftData

/// Historial de sesiones de estudio (sincronizado entre dispositivos).
/// Permite recuperar las palabras anotadas en cualquier sesión, en cualquier dispositivo.
struct SessionsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \StudySession.startedAt, order: .reverse) private var sessions: [StudySession]

    var body: some View {
        NavigationStack {
            List {
                ForEach(sessions) { session in
                    NavigationLink(value: session) {
                        SessionRow(session: session)
                    }
                }
                .onDelete(perform: delete)
            }
            .overlay {
                if sessions.isEmpty {
                    ContentUnavailableView(
                        "Sin sesiones todavía",
                        systemImage: "clock.badge.questionmark",
                        description: Text("Empezá una desde la pestaña Pomodoro.")
                    )
                }
            }
            .navigationTitle("Sesiones")
            .navigationDestination(for: StudySession.self) { session in
                SessionDetailView(session: session)
            }
        }
    }

    /// Borrar una sesión NO borra sus palabras (siguen en su mazo).
    private func delete(at offsets: IndexSet) {
        for index in offsets { context.delete(sessions[index]) }
        do {
            try context.save()
        } catch {
            Log.persistence.error("Error al borrar sesión: \(error.localizedDescription, privacy: .public)")
        }
    }
}

private struct SessionRow: View {
    let session: StudySession

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(session.startedAt.formatted(date: .abbreviated, time: .shortened)).font(.headline)
                if session.isOpen {
                    Text("En curso")
                        .font(.caption.bold())
                        .foregroundStyle(Palette.ink)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Palette.good, in: Capsule())
                }
            }
            Text("\(session.wordCount) palabras · \(session.pomodorosCompleted) pomodoros")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

struct SessionDetailView: View {
    @Environment(\.modelContext) private var context
    @Bindable var session: StudySession

    var body: some View {
        List {
            Section("Resumen") {
                LabeledContent("Inicio", value: session.startedAt.formatted(date: .abbreviated, time: .shortened))
                if let end = session.endedAt {
                    LabeledContent("Fin", value: end.formatted(date: .omitted, time: .shortened))
                }
                LabeledContent("Pomodoros", value: "\(session.pomodorosCompleted)")
            }

            Section("Palabras anotadas (\(session.wordCount))") {
                ForEach((session.cards ?? []).sorted { $0.createdAt < $1.createdAt }) { card in
                    HStack(spacing: 12) {
                        Image(systemName: card.kind.symbol)
                            .foregroundStyle(Palette.ink)
                            .frame(width: 28, height: 28)
                            .background(card.kind.color, in: RoundedRectangle(cornerRadius: 6))
                        VStack(alignment: .leading) {
                            Text(card.front).bold()
                            Text(card.back).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(card.deck?.name ?? "Sin mazo")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if session.isOpen {
                Button("Terminar sesión") {
                    session.endedAt = .now
                    do {
                        try context.save()
                    } catch {
                        Log.persistence.error("Error al cerrar sesión: \(error.localizedDescription, privacy: .public)")
                    }
                }
            }
        }
        .navigationTitle("Sesión")
    }
}
