import Foundation
import SwiftData

/// Formato de archivo para exportar/importar mazos (JSON versionado).
/// Permite compartir un mazo por AirDrop, Archivos, mail, etc., o hacer un respaldo.
/// No incluye el progreso de repaso: quien importa empieza de cero.
struct DeckExport: Codable, Equatable, Sendable {
    static let currentVersion = 1

    var version: Int
    var name: String
    var languageCode: String
    var cards: [CardExport]
}

struct CardExport: Codable, Equatable, Sendable {
    var front: String
    var back: String
    var pronunciation: String
    var example: String
    var kind: String
    var gender: String?
}

enum DeckTransferError: LocalizedError, Equatable {
    case fileTooLarge
    case unsupportedVersion(Int)
    case invalidFormat
    case empty
    case tooManyCards
    case unsupportedFileType

    var errorDescription: String? {
        switch self {
        case .fileTooLarge: "El archivo es demasiado grande (máximo 5 MB)."
        case .unsupportedVersion(let v): "El archivo es de una versión más nueva de la app (v\(v))."
        case .invalidFormat: "El archivo no tiene un formato válido."
        case .empty: "El archivo no contiene tarjetas."
        case .tooManyCards: "El archivo tiene demasiadas tarjetas (máximo 20.000)."
        case .unsupportedFileType: "Tipo de archivo no soportado. Usá .json (de esta app) o .txt/.tsv separado por tabulaciones."
        }
    }
}

/// Lógica de importación/exportación. Todo lo que viene de un archivo se trata
/// como **no confiable**: se limita el tamaño, la cantidad de tarjetas y el largo
/// de cada campo, y se limpia el texto antes de guardarlo.
enum DeckTransfer {
    static let maxFileBytes = 5 * 1024 * 1024
    static let maxCards = 20_000

    // MARK: Exportar

    static func makeExport(from deck: Deck) -> DeckExport {
        let cards = (deck.cards ?? [])
            .sorted { $0.createdAt < $1.createdAt }
            .map {
                CardExport(
                    front: $0.front,
                    back: $0.back,
                    pronunciation: $0.pronunciation,
                    example: $0.example,
                    kind: $0.kindRaw,
                    gender: $0.genderRaw
                )
            }
        return DeckExport(
            version: DeckExport.currentVersion,
            name: deck.name,
            languageCode: deck.languageCode,
            cards: cards
        )
    }

    static func encode(_ export: DeckExport) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(export)
    }

    /// Escribe el mazo en un archivo temporal y devuelve su URL (para compartir).
    static func writeTemporaryFile(for deck: Deck) throws -> URL {
        let data = try encode(makeExport(from: deck))
        let safeName = fileSafeName(deck.name)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(safeName).mnemo.json")
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    static func fileSafeName(_ name: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_ "))
        let filtered = String(String.UnicodeScalarView(name.unicodeScalars.filter { allowed.contains($0) }))
            .trimmingCharacters(in: .whitespaces)
        return filtered.isEmpty ? "mazo" : String(filtered.prefix(60))
    }

    // MARK: Importar

    /// Lee un archivo elegido por el usuario (desde `fileImporter`).
    static func load(from url: URL) throws -> DeckExport {
        // En iOS/macOS con sandbox, los archivos elegidos por el usuario requieren este acceso explícito.
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }

        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= maxFileBytes else { throw DeckTransferError.fileTooLarge }

        let data = try Data(contentsOf: url)
        let fallbackName = url.deletingPathExtension().deletingPathExtension().lastPathComponent

        switch url.pathExtension.lowercased() {
        case "json":
            return try decode(data)
        case "txt", "tsv":
            guard let text = String(data: data, encoding: .utf8) else { throw DeckTransferError.invalidFormat }
            return try parseTabSeparated(text, deckName: fallbackName)
        default:
            throw DeckTransferError.unsupportedFileType
        }
    }

    static func decode(_ data: Data) throws -> DeckExport {
        guard data.count <= maxFileBytes else { throw DeckTransferError.fileTooLarge }
        let raw: DeckExport
        do {
            raw = try JSONDecoder().decode(DeckExport.self, from: data)
        } catch {
            Log.transfer.error("JSON inválido al importar")
            throw DeckTransferError.invalidFormat
        }
        guard raw.version <= DeckExport.currentVersion else {
            throw DeckTransferError.unsupportedVersion(raw.version)
        }
        return try sanitized(raw)
    }

    /// Formato de texto de Anki ("Exportar notas como texto plano"):
    /// una tarjeta por línea, `frente<TAB>reverso[<TAB>pronunciación<TAB>ejemplo]`.
    /// Las líneas que empiezan con `#` son encabezados y se ignoran.
    static func parseTabSeparated(_ text: String, deckName: String) throws -> DeckExport {
        var cards: [CardExport] = []
        for line in text.split(whereSeparator: \.isNewline) {
            if line.hasPrefix("#") { continue }
            let columns = line.split(separator: "\t", omittingEmptySubsequences: false).map {
                TextSanitizer.stripHTML(String($0))
            }
            guard columns.count >= 2 else { continue }
            cards.append(CardExport(
                front: columns[0],
                back: columns[1],
                pronunciation: columns.count > 2 ? columns[2] : "",
                example: columns.count > 3 ? columns[3] : "",
                kind: WordKind.other.rawValue,
                gender: nil
            ))
            if cards.count > maxCards { throw DeckTransferError.tooManyCards }
        }
        return try sanitized(DeckExport(
            version: DeckExport.currentVersion,
            name: deckName,
            languageCode: "en",
            cards: cards
        ))
    }

    /// Limpia todos los campos y descarta tarjetas vacías.
    static func sanitized(_ export: DeckExport) throws -> DeckExport {
        guard export.cards.count <= maxCards else { throw DeckTransferError.tooManyCards }

        let cards = export.cards.compactMap { card -> CardExport? in
            let front = TextSanitizer.clean(card.front)
            let back = TextSanitizer.clean(card.back)
            guard !front.isEmpty, !back.isEmpty else { return nil }
            return CardExport(
                front: front,
                back: back,
                pronunciation: TextSanitizer.clean(card.pronunciation),
                example: TextSanitizer.clean(card.example),
                kind: WordKind(rawValue: card.kind)?.rawValue ?? WordKind.other.rawValue,
                gender: card.gender.flatMap(GrammaticalGender.init(rawValue:))?.rawValue
            )
        }
        guard !cards.isEmpty else { throw DeckTransferError.empty }

        let name = TextSanitizer.clean(export.name, maxLength: TextSanitizer.maxNameLength)
        let language = TextSanitizer.clean(export.languageCode, maxLength: 20)
        return DeckExport(
            version: DeckExport.currentVersion,
            name: name.isEmpty ? "Mazo importado" : name,
            languageCode: language.isEmpty ? "en" : language,
            cards: cards
        )
    }

    /// Crea el mazo y sus tarjetas en la base. Recibe un export ya validado.
    @MainActor
    @discardableResult
    static func insert(_ export: DeckExport, into context: ModelContext) -> Deck {
        let deck = Deck(name: export.name, languageCode: export.languageCode)
        context.insert(deck)
        for item in export.cards {
            let card = Card(
                front: item.front,
                back: item.back,
                pronunciation: item.pronunciation,
                example: item.example,
                kind: WordKind(rawValue: item.kind) ?? .other,
                gender: item.gender.flatMap(GrammaticalGender.init(rawValue:))
            )
            card.deck = deck
            context.insert(card)
        }
        return deck
    }
}
