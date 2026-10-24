import Foundation
import Testing
@testable import Mnemo

@MainActor
struct PomodoroTimerTests {
    let start = Date(timeIntervalSince1970: 1_800_000_000)

    func makeTimer() -> PomodoroTimer {
        let timer = PomodoroTimer()
        timer.notificationsEnabled = false
        timer.durations = .init(focus: 100, shortBreak: 10, longBreak: 30, cyclesBeforeLongBreak: 2)
        return timer
    }

    @Test func remainingIsComputedFromEndDate() {
        let timer = makeTimer()
        timer.start(now: start)
        #expect(timer.remaining(at: start.addingTimeInterval(40)) == 60)
    }

    @Test func pauseFreezesRemaining() {
        let timer = makeTimer()
        timer.start(now: start)
        timer.pause(now: start.addingTimeInterval(30))
        #expect(timer.isPaused)
        #expect(timer.remaining(at: start.addingTimeInterval(500)) == 70)
        timer.start(now: start.addingTimeInterval(500))
        #expect(timer.remaining(at: start.addingTimeInterval(510)) == 60)
    }

    @Test func focusThenShortBreakThenLongBreak() {
        let timer = makeTimer()
        timer.start(now: start)
        timer.tick(now: start.addingTimeInterval(100))
        #expect(timer.phase == .shortBreak)
        #expect(timer.completedFocusCount == 1)

        timer.start(now: start)
        timer.tick(now: start.addingTimeInterval(10))
        #expect(timer.phase == .focus)

        timer.start(now: start)
        timer.tick(now: start.addingTimeInterval(100))
        #expect(timer.phase == .longBreak)
        #expect(timer.completedFocusCount == 2)
    }

    @Test func skipDoesNotCountFocus() {
        let timer = makeTimer()
        timer.skip()
        #expect(timer.phase == .shortBreak)
        #expect(timer.completedFocusCount == 0)
    }
}
