// This deployment exposes Ayurveda only.
import ayurveda from '@ayurveda/index';

export const DOMAIN_LIST = [ayurveda];
export const DOMAINS = Object.fromEntries(DOMAIN_LIST.map((d) => [d.key, d.label]));
