import SwiftUI
import SwiftData

/// Anotación rápida de palabras durante una sesión.
/// Cada palabra anotada se crea como tarjeta en el mazo elegido y queda vinculada a la sesión.
struct QuickNoteView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Deck.name) private var decks: [Deck]

    let session: StudySession

    @AppStorage(SettingsKeys.quickNoteDeckID) private var selectedDeckID = ""
    @State private var front = ""
    @State private var back = ""
    @State private var kind: WordKind = .noun
    @FocusState private var focusedField: Field?

    private enum Field { case front, back }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Anotar palabra").font(.headline)

            Picker("Mazo", selection: $selectedDeckID) {
                Text("Mazo \"Anotaciones\" (automático)").tag("")
                ForEach(decks) { deck in
                    Text(deck.name).tag(deck.id.uuidString)
                }
            }

            Picker("Tipo", selection: $kind) {
                ForEach(WordKind.allCases) { kind in
                    Label(kind.label, systemImage: kind.symbol).tag(kind)
                }
            }

            TextField("Palabra", text: $front)
                .focused($focusedField, equals: .front)
                .onSubmit { focusedField = .back }
            TextField("Significado", text: $back)
                .focused($focusedField, equals: .back)
                .onSubmit(addWord)

            Button("Anotar", systemImage: "plus.circle.fill", action: addWord)
                .buttonStyle(.borderedProminent)
                .tint(kind.color)
                .foregroundStyle(Palette.ink)
                .disabled(!isValid)

            if let words = session.cards, !words.isEmpty {
                Divider()
                Text("Anotadas en esta sesión").font(.subheadline.bold())
                ForEach(words.sorted { $0.createdAt > $1.createdAt }) { card in
                    HStack {
                        Circle().fill(card.kind.color).frame(width: 10, height: 10)
                        Text(card.front).bold()
                        Text("— \(card.back)").foregroundStyle(.secondary)
                    }
                }
            }
        }
        .textFieldStyle(.roundedBorder)
    }

    private var isValid: Bool {
        !TextSanitizer.clean(front).isEmpty && !TextSanitizer.clean(back).isEmpty
    }

    private func addWord() {
        guard isValid else { return }
        let card = Card(front: TextSanitizer.clean(front), back: TextSanitizer.clean(back), kind: kind)
        card.deck = targetDeck()
        card.session = session
        context.insert(card)
        do {
            try context.save()
        } catch {
            Log.persistence.error("Error al anotar palabra: \(error.localizedDescription, privacy: .public)")
        }
        front = ""
        back = ""
        focusedField = .front
    }

    /// Mazo elegido o, si no hay, el mazo "Anotaciones" (se crea si no existe).
    private func targetDeck() -> Deck {
        if let deck = decks.first(where: { $0.id.uuidString == selectedDeckID }) {
            return deck
        }
        let inboxName = "Anotaciones"
        if let inbox = decks.first(where: { $0.name == inboxName }) {
            return inbox
        }
        let inbox = Deck(name: inboxName, languageCode: "en")
        context.insert(inbox)
        return inbox
    }
}
