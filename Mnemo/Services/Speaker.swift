import AVFoundation

/// Pronuncia palabras con las voces del sistema (funciona sin internet).
@MainActor
final class Speaker {
    private let synthesizer = AVSpeechSynthesizer()

    func speak(_ text: String, languageCode: String) {
        guard !text.isEmpty else { return }
        let utterance = AVSpeechUtterance(string: text)
        // Si el dispositivo no tiene voz para ese idioma, usa la voz por defecto.
        utterance.voice = AVSpeechSynthesisVoice(language: languageCode)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        synthesizer.stopSpeaking(at: .immediate)
        synthesizer.speak(utterance)
    }
}
