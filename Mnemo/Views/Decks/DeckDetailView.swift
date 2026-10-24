import SwiftUI
import SwiftData

/// Detalle de un mazo: botón de estudiar, lista de tarjetas, búsqueda, edición y exportación.
struct DeckDetailView: View {
    @Environment(\.modelContext) private var context
    @Bindable var deck: Deck

    @State private var search = ""
    @State private var isAddingCard = false
    @State private var cardToEdit: Card?
    @State private var isEditingDeck = false
    @State private var isStudying = false
    @State private var isExporting = false

    var body: some View {
        List {
            Section {
                TimelineView(.everyMinute) { timeline in
                    let due = deck.dueCount(at: timeline.date)
                    Button {
                        isStudying = true
                    } label: {
                        Label(
                            due > 0 ? "Estudiar \(due) tarjetas" : "No hay tarjetas para hoy",
                            systemImage: "brain.head.profile"
                        )
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Palette.coral)
                    .disabled(due == 0)
                }
            }

            Section("Tarjetas (\(deck.cardCount))") {
                ForEach(filteredCards) { card in
                    Button { cardToEdit = card } label: { CardRow(card: card) }
                        .buttonStyle(.plain)
                }
                .onDelete(perform: deleteCards)
            }
        }
        .searchable(text: $search, prompt: "Buscar palabra o significado")
        .navigationTitle(deck.name)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Nueva tarjeta", systemImage: "plus") { isAddingCard = true }
            }
            ToolbarItem(placement: .secondaryAction) {
                Menu("Más", systemImage: "ellipsis.circle") {
                    Button("Editar mazo", systemImage: "pencil") { isEditingDeck = true }
                    Button("Exportar / compartir", systemImage: "square.and.arrow.up") { isExporting = true }
                }
            }
        }
        .sheet(isPresented: $isAddingCard) {
            CardEditorView(deck: deck)
        }
        .sheet(item: $cardToEdit) { card in
            CardEditorView(deck: deck, card: card)
        }
        .sheet(isPresented: $isEditingDeck) {
            DeckEditorView(deck: deck)
        }
        .sheet(isPresented: $isExporting) {
            ExportSheet(deck: deck)
        }
        #if os(macOS)
        .sheet(isPresented: $isStudying) {
            ReviewView(deck: deck).frame(minWidth: 600, minHeight: 600)
        }
        #else
        .fullScreenCover(isPresented: $isStudying) {
            ReviewView(deck: deck)
        }
        #endif
    }

    private var sortedCards: [Card] {
        (deck.cards ?? []).sorted { $0.createdAt > $1.createdAt }
    }

    private var filteredCards: [Card] {
        let query = search.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return sortedCards }
        return sortedCards.filter {
            $0.front.localizedCaseInsensitiveContains(query) || $0.back.localizedCaseInsensitiveContains(query)
        }
    }

    private func deleteCards(at offsets: IndexSet) {
        let cards = filteredCards
        for index in offsets { context.delete(cards[index]) }
        do {
            try context.save()
        } catch {
            Log.persistence.error("Error al borrar tarjetas: \(error.localizedDescription, privacy: .public)")
        }
    }
}

private struct CardRow: View {
    let card: Card

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: card.kind.symbol)
                .foregroundStyle(Palette.ink)
                .frame(width: 32, height: 32)
                .background(card.kind.color, in: RoundedRectangle(cornerRadius: 8))
                .accessibilityLabel(card.kind.label)
            VStack(alignment: .leading, spacing: 2) {
                Text(card.front).font(.headline)
                Text(card.back).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            if card.isNew {
                Text("Nueva").font(.caption).foregroundStyle(.secondary)
            } else {
                Text(card.dueDate, format: .relative(presentation: .named))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
    }
}
