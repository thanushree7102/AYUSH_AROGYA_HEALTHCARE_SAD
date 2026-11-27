// Independent AYUSH application: this package exposes only its own domain.
import siddha from '@siddha/index';
export const DOMAIN_LIST = [siddha];
export const DOMAINS = Object.fromEntries(DOMAIN_LIST.map((d) => [d.key, d.label]));
