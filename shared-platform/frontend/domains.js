// The standalone Yoga & Naturopathy application exposes only its own AYUSH domain.
import yoga from '@yoga/index';
export const DOMAIN_LIST = [yoga];
export const DOMAINS = Object.fromEntries(DOMAIN_LIST.map((d) => [d.key, d.label]));
