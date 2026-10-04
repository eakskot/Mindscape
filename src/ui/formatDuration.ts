/** "mm:ss" - good up to just under 100 minutes, which covers every countdown this app shows (a cooldown tops out at 60). */
export function formatMMSS(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
