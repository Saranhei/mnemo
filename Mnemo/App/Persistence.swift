import Foundation
import SwiftData

/// Crea el almacenamiento de la app.
///
/// ## Cómo funciona la sincronización entre dispositivos
/// SwiftData guarda los datos en una base local del dispositivo. Con
/// `cloudKitDatabase: .automatic`, SwiftData además replica esa base en la
/// **base privada de iCloud del usuario** (CloudKit), usando el contenedor
/// declarado en los *entitlements* del target (no en el código).
///
/// - No hay credenciales, tokens ni API keys: CloudKit autentica con la cuenta
///   de Apple con la que el dispositivo ya inició sesión.
/// - Si el target no tiene iCloud configurado, o el usuario no inició sesión,
///   la app funciona igual, solo que en modo local.
enum Persistence {
    static var schema: Schema { Schema([Deck.self, Card.self, StudySession.self]) }
    private static let storeName = "Mnemo"

    static func makeContainer() -> ModelContainer {
        // 1) Intento con sincronización iCloud.
        do {
            let cloud = ModelConfiguration(storeName, schema: schema, cloudKitDatabase: .automatic)
            return try ModelContainer(for: schema, configurations: [cloud])
        } catch {
            Log.persistence.error("No se pudo abrir el almacenamiento con iCloud: \(error.localizedDescription, privacy: .public)")
        }

        // 2) Respaldo: solo local (los datos no se pierden; se sincronizan cuando iCloud vuelva a estar disponible).
        do {
            let local = ModelConfiguration(storeName, schema: schema, cloudKitDatabase: .none)
            return try ModelContainer(for: schema, configurations: [local])
        } catch {
            // Sin almacenamiento la app no puede funcionar. Es un error de configuración
            // del proyecto, no algo que el usuario pueda resolver.
            fatalError("No se pudo crear el almacenamiento local: \(error)")
        }
    }

    /// Contenedor en memoria para previews de Xcode y tests (no toca disco ni iCloud).
    @MainActor
    static func makePreviewContainer() -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        // swiftlint:disable:next force_try
        let container = try! ModelContainer(for: schema, configurations: [config])
        let deck = Deck(name: "Japonés básico", languageCode: "ja")
        container.mainContext.insert(deck)
        let samples: [(String, String, WordKind)] = [
            ("あ", "a", .character),
            ("猫", "gato", .noun),
            ("食べる", "comer", .verb),
            ("大きい", "grande", .adjective)
        ]
        for (front, back, kind) in samples {
            let card = Card(front: front, back: back, kind: kind)
            card.deck = deck
            container.mainContext.insert(card)
        }
        return container
    }
}
