# Visual refresh, part 2: scenes, standing characters, a path map and a real celebration

Status: implemented (2026-11-04; scenes, figures and clips in #341, round 4 in #347, build 54 and 55 polish in #350). Approved by the owner, 3 November 2026 ("the plan does sounds good", "yes go with the look, and do the full-body poses", "its alright").

## Why

Part 1 (the 2 November spec) brought 3D icons, tile colours, chunky buttons and ten approved poses. The owner looked at the result against the mockups and said: "i believe there is still a huge gap ... there is still a lot of room for improvment, to make it more alive more 3D, more cinematic".

The side-by-side page (https://claude.ai/artifact/5aHfKXCopDZJS5skScC3TG) found the same four problems on every screen:
- the characters are small stickers instead of actors;
- every screen sits on the same flat mint;
- nothing moves except a slow breath;
- big moments are not celebrated.

The owner approved seven moves to fix this, plus full-body poses with an adult human body type. In the owner's words: "have in mind the its human body type not llama body type". Their reference image is a group shot of tall, film-real llama-headed characters.

## Goals

1. **A scene behind each main screen**, rendered in the same 3D style as the characters:
   - Learn: a sunny garden with a cobblestone path.
   - Hector: his library.
   - Listen: a cosy radio studio.
   - Profile: a hall of achievements.
   - Lesson complete: a stage with spotlights and confetti.
2. **Characters as actors.**
   - Alphonso stands full size in the Learn scene, beside the current lesson, with a speech bubble.
   - Lesson complete: Alphonso stands full size on the stage, proud.
   - Hector stands full size in his library on the Hector paywall and in Hector's empty state.
3. **The lesson path as a map.** The current unit's lessons are big 3D nodes (done, current, locked) laid along the scene. The current node is bigger, glows and invites a tap.
4. **A celebration at lesson complete.**
   - Confetti and light.
   - XP and streak count up from zero.
   - The reward chips pop in one after another.
   - On iPhone, a success haptic.
5. **Listen and Profile feel full.**
   - Listen: a scene header and large episode or folder cards.
   - Profile: a scene header with three big numbers (XP, streak and one more number the screen already has), then the menu.
6. **Depth on every control.** Chunky buttons with a pressed bottom edge everywhere. Glass cards over the scenes. The scene moves at half the scroll speed (parallax).
7. **The same on iPhone and the website**, from the same image files.

## Non-goals

- No behaviour changes. Lessons, billing, Hector's logic, sync and leagues stay the same, and no new data is tracked. This is the same rule as part 1.
- No new art beyond what the owner has approved. The assets are listed under Assets.
- No looping video clips yet (move 5). They come later, once the scenes are in, and only with the owner's go-ahead on cost.
- No episode cover art this round. Listen uses large cards with the existing 3D icons. This saves credits; it was my call.
- No Android. No app icon. No build 53 without the owner's OK.

## Anti-goals: what would make this a failure even if it works

- Text that is hard to read over a busy scene. Every text block sits on a solid or glass surface, or on a scrim. Contrast follows the app's existing accessibility guards.
- A slower app. Scenes are compressed JPEGs, about 1080 px wide and well under 400 KB each. They are lazy where possible and never block first paint.
- Motion that ignores Reduce Motion. With Reduce Motion on, there is no parallax, no confetti, no count-up and no bouncing node. Everything shows in its final state.
- Dark themes that blind people. In dark themes the scenes get a darker scrim. Studio Ink, the minimalist dark theme, keeps a strong scrim so its character stays.

## Assets (approved)

| Name | Higgsfield job | Use |
|---|---|---|
| scene `learn` | cecb0e7e | Learn background |
| scene `hector` | 411b7cc5 | Hector tab, Hector paywall |
| scene `listen` | f5241b75 | Listen header |
| scene `profile` | 74e03b17 | Profile header |
| scene `complete` | e9b4c430 | Lesson complete |
| figure `alphonso-waving` | 9f6a8a00, cut-out f9afe726 | Learn |
| figure `alphonso-proud` | 50875d34, cut-out 82610590 | Lesson complete |
| figure `hector-waving` | f314203b, cut-out cbfc9bc0 | Hector paywall, Hector empty state |

The files live at these paths:
- Web: `public/scenes/<name>.jpg` and `public/figures/<name>.png`.
- iPhone: the image sets `Scene-<name>` and `Figure-<name>`, each one universal image, like the poses.

A figure is a full-body cut-out, trimmed but not squared.

## What is left to the builder

- Exact sizes, offsets and the scrim strength per theme.
- Where the bubble sits.
- How many confetti pieces.
- Each of these must pass the existing contrast and Reduce Motion guards.
- The Learn map shows the current unit only. The website keeps its full unit list below the map.
- iPhone Profile's third big number comes from whatever the screen already loads. If it has nothing, show two numbers rather than track something new.
