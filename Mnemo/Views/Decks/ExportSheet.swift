import SwiftUI

/// Genera el archivo .json del mazo y lo ofrece con la hoja de compartir del sistema
/// (AirDrop, Archivos, Mail...). El archivo se escribe en la carpeta temporal de la app.
struct ExportSheet: View {
    @Environment(\.dismiss) private var dismiss
    let deck: Deck

    @State private var fileURL: URL?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "square.and.arrow.up.on.square.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(Palette.sky)
                Text("Exportar \"\(deck.name)\"").font(.title2.bold())
                Text("Se exportan las palabras, no tu progreso de repaso. Quien lo importe empieza de cero.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                if let fileURL {
                    ShareLink(item: fileURL) {
                        Label("Compartir archivo", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Palette.sky)
                    .foregroundStyle(Palette.ink)
                } else if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                } else {
                    ProgressView()
                }
            }
            .padding(32)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
            .task { prepareFile() }
        }
        .frame(minWidth: 360, minHeight: 320)
    }

    private func prepareFile() {
        do {
            fileURL = try DeckTransfer.writeTemporaryFile(for: deck)
        } catch {
            Log.transfer.error("No se pudo exportar: \(error.localizedDescription, privacy: .public)")
            errorMessage = "No se pudo generar el archivo."
        }
    }
}
