// This deployment exposes the Unani system only.
import unani from '@unani/index';
export const DOMAIN_LIST = [unani];
export const DOMAINS = Object.fromEntries(DOMAIN_LIST.map((d) => [d.key, d.label]));
