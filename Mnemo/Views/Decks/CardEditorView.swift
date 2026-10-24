import SwiftUI
import SwiftData

/// Formulario para crear o editar una tarjeta, con vista previa en vivo de sus colores.
struct CardEditorView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    let deck: Deck
    /// `nil` = crear una nueva.
    var card: Card?

    @State private var front = ""
    @State private var back = ""
    @State private var pronunciation = ""
    @State private var example = ""
    @State private var kind: WordKind = .noun
    @State private var gender: GrammaticalGender?
    @State private var keepAdding = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CardFaceView(
                        text: front.isEmpty ? "Palabra" : front,
                        kind: kind,
                        gender: gender,
                        compact: true
                    )
                    .listRowInsets(EdgeInsets())
                }

                Section("Palabra") {
                    TextField("Palabra / carácter (ej. 猫)", text: $front)
                    TextField("Significado (ej. gato)", text: $back)
                    TextField("Pronunciación (opcional, ej. neko)", text: $pronunciation)
                    TextField("Ejemplo (opcional)", text: $example, axis: .vertical)
                        .lineLimit(1...4)
                }

                Section("Tipo (define el color)") {
                    Picker("Tipo", selection: $kind) {
                        ForEach(WordKind.allCases) { kind in
                            Label(kind.label, systemImage: kind.symbol).tag(kind)
                        }
                    }
                    if kind == .noun {
                        Picker("Género", selection: $gender) {
                            Text("Sin género").tag(GrammaticalGender?.none)
                            ForEach(GrammaticalGender.allCases) { gender in
                                Label(gender.label, systemImage: gender.symbol).tag(GrammaticalGender?.some(gender))
                            }
                        }
                    }
                }

                if card == nil {
                    Toggle("Seguir agregando después de guardar", isOn: $keepAdding)
                }
            }
            .formStyle(.grouped)
            .navigationTitle(card == nil ? "Nueva tarjeta" : "Editar tarjeta")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { save() }
                        .disabled(!isValid)
                }
            }
            .onAppear(perform: loadCard)
            .onChange(of: kind) { _, newKind in
                if newKind != .noun { gender = nil }
            }
        }
        .frame(minWidth: 380, minHeight: 520)
    }

    private var isValid: Bool {
        !TextSanitizer.clean(front).isEmpty && !TextSanitizer.clean(back).isEmpty
    }

    private func loadCard() {
        guard let card else { return }
        front = card.front
        back = card.back
        pronunciation = card.pronunciation
        example = card.example
        kind = card.kind
        gender = card.gender
    }

    private func save() {
        let target = card ?? Card(front: "", back: "")
        target.front = TextSanitizer.clean(front)
        target.back = TextSanitizer.clean(back)
        target.pronunciation = TextSanitizer.clean(pronunciation)
        target.example = TextSanitizer.clean(example)
        target.kind = kind
        target.gender = kind == .noun ? gender : nil

        if card == nil {
            target.deck = deck
            context.insert(target)
        }

        do {
            try context.save()
        } catch {
            Log.persistence.error("Error al guardar tarjeta: \(error.localizedDescription, privacy: .public)")
        }

        if keepAdding && card == nil {
            front = ""
            back = ""
            pronunciation = ""
            example = ""
        } else {
            dismiss()
        }
    }
}
