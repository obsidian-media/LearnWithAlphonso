import { getCourse, type Course } from "@/data/courses";
import { scenariosFor, type LocalizedScenario } from "@/data/scenarios";
import { campaignsFor, type LocalizedCampaign } from "@/data/campaigns";
import type { Unit } from "@/data/curriculum";
import { ACHIEVEMENTS, type Achievement } from "@/data/achievements";
import { VOCAB_IMAGES, type VocabImage } from "@/data/vocab-images";
import type { PlacementQuestion } from "@/data/placement";

export type IOSContentBundle = {
  course: Course;
  units: Unit[];
};

/**
 * Extracts one course's full curriculum, unchanged, into the shape the
 * native iOS app's bundled JSON will use. This is intentionally a
 * pass-through, not a transform -- the native Swift Codable models (see
 * the native-app plan) are written to decode exactly this shape, so a
 * lesson/unit/question schema change here must be mirrored there. Real
 * export logic lives here (a pure function) so it's testable without
 * writing to disk; scripts/export-ios-content.ts is a thin CLI wrapper
 * around it.
 */
export function buildIOSContentBundle(course: Course): IOSContentBundle {
  const { curriculum } = getCourse(course);
  return { course, units: curriculum };
}

/** One course's flat scenario, exactly the shape the Kit's `Scenario` decodes. */
export type IOSScenario = LocalizedScenario;

/**
 * One course's scenarios, flat. Defaults to English because
 * scripts/export-android-content.ts calls this with no argument and Android
 * must keep decoding the unchanged English file.
 */
export function buildIOSScenariosBundle(course: Course = "en"): IOSScenario[] {
  return scenariosFor(course);
}

/** One course's flat campaign, exactly the shape the Kit's `Campaign` decodes. */
export type IOSCampaign = LocalizedCampaign;

/**
 * V4 candidate #4, made per-course: same pass-through reasoning as
 * buildIOSScenariosBundle. iOS decodes this into the mirrored `Campaign`/
 * `CampaignScene` structs in CurriculumModels.swift; the course lives in the
 * file name (campaigns.json = en, campaigns-fr.json, campaigns-es.json).
 */
export function buildIOSCampaignsBundle(course: Course = "en"): IOSCampaign[] {
  return campaignsFor(course);
}

/** Same pass-through reasoning as buildIOSContentBundle, for ACHIEVEMENTS. */
export function buildIOSAchievementsBundle(): Achievement[] {
  return ACHIEVEMENTS;
}

/** Same pass-through reasoning as buildIOSContentBundle, for VOCAB_IMAGES. */
export function buildIOSVocabImagesBundle(): Record<string, VocabImage> {
  return VOCAB_IMAGES;
}

/**
 * The full, unsampled placement-question pool for one course (9 per CEFR
 * band -- see placement.ts's PLACEMENT_QUESTIONS doc comment). Same
 * pass-through reasoning as buildIOSContentBundle: iOS decodes this into
 * the mirrored `PlacementQuestion` enum in PlacementModels.swift and runs
 * its own port of pickPlacementSet/groupByBand/nextAdaptiveBand/
 * scorePlacement (PlacementLogic.swift) client-side, exactly like the web
 * app's placement.tsx -- so the *sampling* happens on-device, fresh per
 * attempt, from this same fixed pool.
 */
export function buildIOSPlacementBundle(course: Course): PlacementQuestion[] {
  return getCourse(course).placementPool;
}
