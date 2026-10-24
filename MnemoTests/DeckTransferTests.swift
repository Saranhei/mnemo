import Foundation
import Testing
@testable import Mnemo

/// Tests de importación/exportación: los archivos importados son datos no confiables.
@MainActor
struct DeckTransferTests {

    @Test func roundTripKeepsContent() throws {
        let original = DeckExport(
            version: 1, name: "Alemán", languageCode: "de",
            cards: [CardExport(front: "Hund", back: "perro", pronunciation: "", example: "", kind: "noun", gender: "masculine")]
        )
        let decoded = try DeckTransfer.decode(DeckTransfer.encode(original))
        #expect(decoded == original)
    }

    @Test func rejectsNewerVersions() throws {
        let future = DeckExport(version: 99, name: "x", languageCode: "en",
                                cards: [CardExport(front: "a", back: "b", pronunciation: "", example: "", kind: "noun", gender: nil)])
        #expect(throws: DeckTransferError.unsupportedVersion(99)) {
            try DeckTransfer.decode(try DeckTransfer.encode(future))
        }
    }

    @Test func rejectsGarbage() {
        #expect(throws: DeckTransferError.invalidFormat) {
            try DeckTransfer.decode(Data("no soy json".utf8))
        }
    }

    @Test func sanitizesFieldsAndDropsEmptyCards() throws {
        let longText = String(repeating: "a", count: 5_000)
        let dirty = DeckExport(
            version: 1, name: "  Mazo\u{0007}  ", languageCode: "ja",
            cards: [
                CardExport(front: "  猫 ", back: longText, pronunciation: "", example: "", kind: "inventado", gender: "otro"),
                CardExport(front: "   ", back: "vacía", pronunciation: "", example: "", kind: "noun", gender: nil)
            ]
        )
        let clean = try DeckTransfer.sanitized(dirty)
        #expect(clean.name == "Mazo")
        #expect(clean.cards.count == 1)
        #expect(clean.cards[0].front == "猫")
        #expect(clean.cards[0].back.count == TextSanitizer.maxFieldLength)
        #expect(clean.cards[0].kind == WordKind.other.rawValue)
        #expect(clean.cards[0].gender == nil)
    }

    @Test func parsesAnkiPlainText() throws {
        let text = """
        #separator:tab
        #html:true
        犬\tperro\tinu
        猫\t<b>gato</b><br>felino
        línea inválida sin tab
        """
        let deck = try DeckTransfer.parseTabSeparated(text, deckName: "Japonés")
        #expect(deck.cards.count == 2)
        #expect(deck.cards[0].pronunciation == "inu")
        #expect(deck.cards[1].back == "gato\nfelino")
    }

    @Test func emptyFileFails() {
        #expect(throws: DeckTransferError.empty) {
            try DeckTransfer.parseTabSeparated("#solo encabezado", deckName: "x")
        }
    }

    @Test func fileSafeNameRemovesPathCharacters() {
        #expect(DeckTransfer.fileSafeName("../../etc/passwd") == "etcpasswd")
        #expect(DeckTransfer.fileSafeName("///") == "mazo")
    }
}
