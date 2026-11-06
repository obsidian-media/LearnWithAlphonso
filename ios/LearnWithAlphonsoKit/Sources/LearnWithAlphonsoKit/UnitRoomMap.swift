import Foundation

/// The room behind Alphonso for each unit (design system spec, "The room plan"), decoded from the bundled
/// unit-rooms.json that scripts/export-ios-content.ts writes from src/data/unit-rooms.ts. A unit's room is always
/// a painted one; its art is `<roomID>.webp` in the app's AlphonsoScenes folder.
public struct UnitRoomMap: Decodable, Sendable {
    public struct Room: Decodable, Sendable, Equatable {
        public let id: String
        public let name: String
        /// False while the room's art is still being painted; no unit uses such a room.
        public let painted: Bool
    }

    public let rooms: [Room]
    /// unitID -> roomID.
    public let units: [String: String]

    public func roomID(forUnit unitID: String) -> String? {
        units[unitID]
    }

    public func room(id: String) -> Room? {
        rooms.first { $0.id == id }
    }

    /// The table bundled with this package.
    public static func bundled() throws -> UnitRoomMap {
        guard let url = Bundle.module.url(forResource: "unit-rooms", withExtension: "json") else {
            throw ContentStoreError.resourceNotFound("unit-rooms")
        }
        return try JSONDecoder().decode(UnitRoomMap.self, from: Data(contentsOf: url))
    }
}
