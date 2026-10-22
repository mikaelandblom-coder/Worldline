// The Draft 1 level list, in play order.

import l1 from '../levels/1-first-steps.json';
import l2 from '../levels/2-running-out-of-time.json';
import l3 from '../levels/3-gates.json';
import l4 from '../levels/4-brakes-cost-fuel.json';
import l5 from '../levels/5-headwind.json';
import l6 from '../levels/6-all-together.json';
import { parseLevel, type Level } from './level';

export const LEVELS: Level[] = [l1, l2, l3, l4, l5, l6].map((json) => parseLevel(json));
