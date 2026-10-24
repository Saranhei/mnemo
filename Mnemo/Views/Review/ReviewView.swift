import SwiftUI
import SwiftData

/// Pantalla de repaso estilo Anki:
/// 1. Se muestra el frente de la tarjeta.
/// 2. El usuario intenta recordar y toca "Mostrar respuesta" (o barra espaciadora).
/// 3. Califica qué tan bien la recordó (1-4). El algoritmo SM-2 calcula el próximo repaso.
/// 4. "Otra vez" vuelve a poner la tarjeta al final de la cola de esta sesión.
struct ReviewView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    let deck: Deck

    @State private var queue: [Card] = []
    @State private var didLoad = false
    @State private var showAnswer = false
    @State private var reviewedCount = 0
    @State private var speaker = Speaker()

    private let scheduler = SM2Scheduler()
    /// Límite por sesión para que repasar no se vuelva abrumador.
    private let maxCardsPerSession = 200

    var body: some View {
        NavigationStack {
            Group {
                if let card = queue.first {
                    reviewContent(for: card)
                } else if didLoad {
                    finishedView
                } else {
                    ProgressView()
                }
            }
            .padding()
            .navigationTitle(deck.name)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                        .keyboardShortcut(.escape, modifiers: [])
                }
                ToolbarItem(placement: .status) {
                    Text("\(reviewedCount) repasadas · \(queue.count) restantes")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .onAppear(perform: loadQueue)
    }

    // MARK: Subvistas

    @ViewBuilder
    private func reviewContent(for card: Card) -> some View {
        VStack(spacing: 20) {
            CardFaceView(text: card.front, kind: card.kind, gender: card.gender)
                .onTapGesture { reveal() }

            if showAnswer {
                answerView(for: card)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                Spacer(minLength: 0)
                gradeButtons(for: card)
            } else {
                Spacer(minLength: 0)
                Button {
                    reveal()
                } label: {
                    Text("Mostrar respuesta")
                        .font(.title3.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(Palette.ink)
                .keyboardShortcut(.space, modifiers: [])
            }
        }
        .frame(maxWidth: 700)
        .animation(.snappy, value: showAnswer)
    }

    private func answerView(for card: Card) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(card.back)
                    .font(.title.bold())
                    .textSelection(.enabled)
                Spacer()
                Button {
                    speaker.speak(card.front, languageCode: deck.languageCode)
                } label: {
                    Image(systemName: "speaker.wave.2.fill")
                }
                .accessibilityLabel("Escuchar pronunciación")
                .keyboardShortcut("p", modifiers: [])
            }
            if !card.pronunciation.isEmpty {
                Text(card.pronunciation).font(.title3).foregroundStyle(.secondary)
            }
            if !card.example.isEmpty {
                Text(card.example).font(.body).italic()
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(card.kind.color, lineWidth: 3)
        )
    }

    private func gradeButtons(for card: Card) -> some View {
        let now = Date.now
        return HStack(spacing: 10) {
            ForEach(ReviewGrade.allCases) { grade in
                Button {
                    rate(card, grade)
                } label: {
                    VStack(spacing: 4) {
                        Text(grade.label).font(.headline)
                        Text(scheduler.previewLabel(for: card.schedulingState, grade: grade, now: now))
                            .font(.caption)
                    }
                    .foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)
                .tint(grade.color)
                .keyboardShortcut(KeyEquivalent(grade.shortcut), modifiers: [])
                .accessibilityHint("Atajo de teclado \(grade.rawValue)")
            }
        }
    }

    private var finishedView: some View {
        ContentUnavailableView {
            Label("¡Listo por ahora!", systemImage: "checkmark.seal.fill")
                .foregroundStyle(Palette.good)
        } description: {
            Text("Repasaste \(reviewedCount) tarjetas. Volvé cuando venzan las próximas.")
        } actions: {
            Button("Cerrar") { dismiss() }
                .buttonStyle(.borderedProminent)
                .tint(Palette.good)
        }
    }

    // MARK: Lógica

    private func loadQueue() {
        guard !didLoad else { return }
        queue = Array(deck.dueCards(at: .now).prefix(maxCardsPerSession))
        didLoad = true
    }

    private func reveal() {
        guard !showAnswer else { return }
        showAnswer = true
    }

    private func rate(_ card: Card, _ grade: ReviewGrade) {
        let now = Date.now
        card.schedulingState = scheduler.schedule(card.schedulingState, grade: grade, now: now)
        card.lastReviewedAt = now

        do {
            try context.save()
        } catch {
            Log.persistence.error("Error al guardar repaso: \(error.localizedDescription, privacy: .public)")
        }

        reviewedCount += 1
        showAnswer = false
        queue.removeFirst()
        // Como en Anki: lo que se olvidó vuelve a aparecer al final de esta sesión.
        if grade == .again { queue.append(card) }
    }
}

#Preview {
    let container = Persistence.makePreviewContainer()
    let deck = try! container.mainContext.fetch(FetchDescriptor<Deck>()).first!
    return ReviewView(deck: deck).modelContainer(container)
}
