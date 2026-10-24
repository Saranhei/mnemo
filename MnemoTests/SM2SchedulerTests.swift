import Foundation
import Testing
@testable import Mnemo

/// Tests del algoritmo de repaso espaciado. Fechas fijas → resultados deterministas.
@MainActor
struct SM2SchedulerTests {
    let scheduler = SM2Scheduler()
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let day: TimeInterval = 86_400

    var newCard: SchedulingState {
        SchedulingState(intervalDays: 0, ease: 2.5, repetitions: 0, lapses: 0, dueDate: now)
    }

    @Test func goodOnNewCardSchedulesOneDay() {
        let next = scheduler.schedule(newCard, grade: .good, now: now)
        #expect(next.intervalDays == 1)
        #expect(next.repetitions == 1)
        #expect(next.dueDate == now.addingTimeInterval(day))
        #expect(next.ease == 2.5)
    }

    @Test func goodTwiceSchedulesSixDaysThenMultipliesByEase() {
        let first = scheduler.schedule(newCard, grade: .good, now: now)
        let second = scheduler.schedule(first, grade: .good, now: now)
        #expect(second.intervalDays == 6)
        let third = scheduler.schedule(second, grade: .good, now: now)
        #expect(third.intervalDays == 15) // 6 × 2.5
    }

    @Test func againResetsAndShowsAgainInTenMinutes() {
        var state = scheduler.schedule(newCard, grade: .good, now: now)
        state = scheduler.schedule(state, grade: .good, now: now)
        let failed = scheduler.schedule(state, grade: .again, now: now)
        #expect(failed.repetitions == 0)
        #expect(failed.lapses == 1)
        #expect(abs(failed.ease - 2.3) < 0.0001)
        #expect(failed.dueDate == now.addingTimeInterval(600))
    }

    @Test func easeNeverDropsBelowMinimum() {
        var state = newCard
        for _ in 0..<20 { state = scheduler.schedule(state, grade: .again, now: now) }
        #expect(state.ease == 1.3)
    }

    @Test func easyGrowsFasterThanGood() {
        let good = scheduler.schedule(newCard, grade: .good, now: now)
        let easy = scheduler.schedule(newCard, grade: .easy, now: now)
        #expect(easy.intervalDays > good.intervalDays)
        #expect(easy.ease > good.ease)
    }

    @Test func intervalIsCapped() {
        let huge = SchedulingState(intervalDays: 3000, ease: 3, repetitions: 10, lapses: 0, dueDate: now)
        let next = scheduler.schedule(huge, grade: .easy, now: now)
        #expect(next.intervalDays == scheduler.maximumIntervalDays)
    }

    @Test(arguments: [
        (TimeInterval(600), "10 min"),
        (TimeInterval(86_400), "1 d"),
        (TimeInterval(86_400 * 60), "2 mes")
    ])
    func formatsIntervals(interval: TimeInterval, expected: String) {
        #expect(SM2Scheduler.format(interval: interval) == expected)
    }
}
