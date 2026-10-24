import SwiftUI
import SwiftData

/// Formulario para crear o editar un mazo.
struct DeckEditorView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    /// `nil` = crear uno nuevo.
    var deck: Deck?

    @State private var name = ""
    @State private var languageCode = "en"

    /// Idiomas sugeridos. El usuario puede elegir cualquiera; el código solo se usa para la voz.
    static let languages = [
        "en", "ja", "ko", "zh-CN", "zh-TW", "de", "fr", "it", "pt-BR", "ru",
        "ar", "he", "el", "hi", "th", "tr", "nl", "sv", "pl", "uk", "es"
    ]

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nombre (ej. Hiragana)", text: $name)
                Picker("Idioma que estudiás", selection: $languageCode) {
                    ForEach(Self.languages, id: \.self) { code in
                        Text(languageName(code)).tag(code)
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle(deck == nil ? "Nuevo mazo" : "Editar mazo")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { save() }
                        .disabled(cleanName.isEmpty)
                }
            }
            .onAppear {
                if let deck {
                    name = deck.name
                    languageCode = deck.languageCode
                }
            }
        }
        .frame(minWidth: 320, minHeight: 220)
    }

    private var cleanName: String {
        TextSanitizer.clean(name, maxLength: TextSanitizer.maxNameLength)
    }

    private func save() {
        if let deck {
            deck.name = cleanName
            deck.languageCode = languageCode
        } else {
            context.insert(Deck(name: cleanName, languageCode: languageCode))
        }
        do {
            try context.save()
        } catch {
            Log.persistence.error("Error al guardar mazo: \(error.localizedDescription, privacy: .public)")
        }
        dismiss()
    }
}
