import XCTest
@testable import LearnWithAlphonsoKit

/// The room plan's bundled table (unit-rooms.json, written by scripts/export-ios-content.ts from
/// src/data/unit-rooms.ts): every unit of every course has a painted room.
final class UnitRoomMapTests: XCTestCase {
    func testTheBundledMapHasTheThirtyFiveRoomsAllPainted() throws {
        let map = try UnitRoomMap.bundled()
        XCTAssertEqual(map.rooms.count, 35)
        XCTAssertEqual(map.rooms.filter(\.painted).count, 35)
        XCTAssertEqual(map.room(id: "smalltalk")?.name, "Park café terrace")
    }

    func testEveryUnitOfEveryCourseHasAPaintedRoom() throws {
        let map = try UnitRoomMap.bundled()
        let store = try ContentStore()
        var checked = 0
        for bundle in [store.english, store.french, store.spanish] {
            for unit in bundle.units {
                let roomID = try XCTUnwrap(map.roomID(forUnit: unit.id), unit.id)
                XCTAssertEqual(map.room(id: roomID)?.painted, true, "\(unit.id) uses \(roomID)")
                checked += 1
            }
        }
        XCTAssertEqual(checked, map.units.count)
    }

    func testAnUnknownUnitHasNoRoom() throws {
        XCTAssertNil(try UnitRoomMap.bundled().roomID(forUnit: "no-such-unit"))
    }
}
