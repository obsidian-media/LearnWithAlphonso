import Foundation

/// The state mapping behind the redesigned Settings screen. The view only draws what these return.
public enum SettingsPresentation {
    /// Whether "Save Name" can be pressed: a name with something in it, and no save already under way.
    public static func canSaveName(_ name: String, isSaving: Bool) -> Bool {
        !isSaving && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Whether the two account buttons (export, delete) can be pressed: neither is already running.
    public static func canStartAccountAction(isExporting: Bool, isDeleting: Bool) -> Bool {
        !isExporting && !isDeleting
    }

    /// Whether the delete confirmation can go ahead: the typed text must match exactly.
    public static func canConfirmDelete(typed: String) -> Bool { typed == "DELETE" }
}
