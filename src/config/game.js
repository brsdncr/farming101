// Life and calendar: every finished market visit (or skipped season) advances time by one visit.
export const START_AGE = 20;
export const DEATH_AGE = 85;
export const VISITS_PER_YEAR = 4;
export const SEASONS = ['summer', 'winter'];
export const VISITS_PER_SEASON = VISITS_PER_YEAR / SEASONS.length;

// Reaching this many coins wins the game; the score is the age it took.
export const GOAL_COINS = 1_000_000;
