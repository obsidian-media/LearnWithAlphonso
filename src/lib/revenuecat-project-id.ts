/** RevenueCat's v2 project ids are "proj" + the id in the dashboard URL ("945111ee"); accept either spelling. */
export function normalizeProjectId(raw: string): string {
  const id = raw.trim();
  return /^proj/i.test(id) ? id : `proj${id}`;
}
