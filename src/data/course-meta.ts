/**
 * The light half of ./courses: the course ids, their labels and speech locales, with no curriculum attached.
 * ./courses re-exports all of it, so either import works, but code that runs on every page (the root route,
 * voice settings, server-function modules the root imports) must import from here: ./courses pulls in every
 * lesson bank, vocab images and the `compromise` library, and once put a 4.8 MB chunk on the landing page.
 * scripts/check-bundle.ts (`bun run check:bundle`) fails the build output if that happens again.
 */
export type Course = "en" | "fr" | "es";

export type CourseMeta = { id: Course; label: string; flag: string; targetLanguage: string };

export const COURSES: CourseMeta[] = [
  { id: "en", label: "English", flag: "🇬🇧", targetLanguage: "English" },
  { id: "fr", label: "French", flag: "🇫🇷", targetLanguage: "French" },
  { id: "es", label: "Spanish", flag: "🇪🇸", targetLanguage: "Spanish" },
];

export function isCourse(value: string): value is Course {
  return value === "en" || value === "fr" || value === "es";
}

// The Spanish course is Latin American, so device speech uses es-MX. Kept equal to the iOS Kit's
// Course.speechLocale by src/lib/ios-binary-polish.test.ts.
const LOCALES: Record<Course, string> = { en: "en-US", fr: "fr-FR", es: "es-MX" };

/** BCP-47 locale for the Web Speech API / AVSpeechSynthesisVoice, per course. */
export function localeForCourse(course: Course): string {
  return LOCALES[course];
}
