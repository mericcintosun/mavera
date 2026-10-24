// Shared motion tokens. Springs for direct manipulation, tweens for reveals.
export { EASE_OUT } from "./reveal";

/** Snappy spring for presses, toggles and active indicators. */
export const SPRING_SNAPPY = {
  type: "spring",
  stiffness: 380,
  damping: 32,
} as const;
/** Soft spring for digit rolls and gentle settling. */
export const SPRING_SOFT = {
  type: "spring",
  stiffness: 240,
  damping: 30,
} as const;
/** Slight overshoot for arrivals (coins landing). */
export const SPRING_BOUNCY = {
  type: "spring",
  stiffness: 420,
  damping: 24,
} as const;
/** Tween durations in seconds. */
export const DUR = { fast: 0.25, base: 0.5, slow: 0.8 } as const;
