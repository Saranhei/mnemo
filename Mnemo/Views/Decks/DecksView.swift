import SwiftUI
import SwiftData
import UniformTypeIdentifiers

/// Lista de mazos: crear, importar, borrar y entrar a cada uno.
struct DecksView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Deck.createdAt, order: .reverse) private var decks: [Deck]

    @State private var isCreating = false
    @State private var isImporting = false
    @State private var deckToDelete: Deck?
    @State private var alertMessage: String?

    var body: some View {
        NavigationStack {
            List {
                ForEach(decks) { deck in
                    NavigationLink(value: deck) {
                        DeckRow(deck: deck)
                    }
                    .contextMenu {
                        Button("Borrar mazo", systemImage: "trash", role: .destructive) {
                            deckToDelete = deck
                        }
                    }
                    .swipeActions {
                        Button("Borrar", systemImage: "trash", role: .destructive) {
                            deckToDelete = deck
                        }
                    }
                }
            }
            .overlay {
                if decks.isEmpty {
                    ContentUnavailableView(
                        "Todavía no hay mazos",
                        systemImage: "rectangle.stack.badge.plus",
                        description: Text("Creá un mazo (por ejemplo \"Hiragana\") o importá uno de Anki.")
                    )
                }
            }
            .navigationTitle("Mazos")
            .navigationDestination(for: Deck.self) { deck in
                DeckDetailView(deck: deck)
            }
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button("Importar", systemImage: "square.and.arrow.down") { isImporting = true }
                    Button("Nuevo mazo", systemImage: "plus") { isCreating = true }
                }
            }
            .sheet(isPresented: $isCreating) {
                DeckEditorView()
            }
            .fileImporter(
                isPresented: $isImporting,
                allowedContentTypes: [.json, .plainText, .tabSeparatedText],
                allowsMultipleSelection: false
            ) { result in
                importDeck(result)
            }
            .confirmationDialog(
                "¿Borrar el mazo y todas sus tarjetas?",
                isPresented: Binding(get: { deckToDelete != nil }, set: { if !$0 { deckToDelete = nil } }),
                titleVisibility: .visible
            ) {
                Button("Borrar", role: .destructive) { deleteSelectedDeck() }
            } message: {
                Text("Se borra en todos tus dispositivos. No se puede deshacer.")
            }
            .alert("Aviso", isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(alertMessage ?? "")
            }
        }
    }

    private func importDeck(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let export = try DeckTransfer.load(from: url)
            DeckTransfer.insert(export, into: context)
            try context.save()
            alertMessage = "Se importaron \(export.cards.count) tarjetas en \"\(export.name)\"."
        } catch {
            alertMessage = error.localizedDescription
        }
    }

    private func deleteSelectedDeck() {
        guard let deck = deckToDelete else { return }
        context.delete(deck)
        do {
            try context.save()
        } catch {
            Log.persistence.error("Error al borrar mazo: \(error.localizedDescription, privacy: .public)")
            alertMessage = "No se pudo borrar el mazo."
        }
        deckToDelete = nil
    }
}

private struct DeckRow: View {
    let deck: Deck

    var body: some View {
        // TimelineView refresca el contador de "para repasar" cada minuto.
        TimelineView(.everyMinute) { context in
            let due = deck.dueCount(at: context.date)
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(deck.name).font(.headline)
                    Text("\(deck.cardCount) tarjetas · \(languageName(deck.languageCode))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if due > 0 {
                    Text("\(due)")
                        .font(.subheadline.bold())
                        .foregroundStyle(Palette.ink)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Palette.tangerine, in: Capsule())
                        .accessibilityLabel("\(due) tarjetas para repasar")
                }
            }
        }
    }
}

func languageName(_ code: String) -> String {
    Locale.current.localizedString(forIdentifier: code)?.capitalized ?? code
}

#Preview {
    DecksView()
        .modelContainer(Persistence.makePreviewContainer())
}
