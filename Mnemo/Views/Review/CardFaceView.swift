import SwiftUI

/// La cara de una tarjeta: fondo del color de su tipo, texto grande de alto contraste,
/// y ícono + etiqueta para que el color nunca sea la única pista.
struct CardFaceView: View {
    let text: String
    let kind: WordKind
    var gender: GrammaticalGender?
    var compact = false

    var body: some View {
        VStack(spacing: compact ? 8 : 16) {
            HStack {
                Label(kind.label, systemImage: kind.symbol)
                    .font(.caption.bold())
                Spacer()
                if let gender {
                    Label(gender.label, systemImage: gender.symbol)
                        .font(.caption.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(gender.color, in: Capsule())
                }
            }

            Spacer(minLength: 0)

            Text(text)
                .font(.system(size: compact ? 40 : 72, weight: .bold, design: .rounded))
                .minimumScaleFactor(0.3)
                .lineLimit(3)
                .multilineTextAlignment(.center)
                .textSelection(.enabled)

            Spacer(minLength: 0)
        }
        .foregroundStyle(Palette.ink)
        .padding(compact ? 16 : 24)
        .frame(maxWidth: .infinity, minHeight: compact ? 160 : 280)
        .background(kind.color, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(alignment: .leading) {
            // Franja de género: refuerza la asociación color-género (útil en alemán, francés...).
            if let gender {
                UnevenRoundedRectangle(topLeadingRadius: 24, bottomLeadingRadius: 24)
                    .fill(gender.color)
                    .frame(width: 12)
            }
        }
        .shadow(color: kind.color.opacity(0.45), radius: 16, y: 8)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    VStack {
        CardFaceView(text: "Hund", kind: .noun, gender: .masculine)
        CardFaceView(text: "あ", kind: .character, compact: true)
    }
    .padding()
}
