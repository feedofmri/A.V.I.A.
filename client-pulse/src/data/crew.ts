import type { CrewId } from '../types';

export const CREW: { id: CrewId; name: string; short: string; baselineId: string }[] = [
  { id: 'okafor', name: 'Cmdr. A. Okafor', short: 'A. Okafor', baselineId: 'C001' },
  { id: 'brandt', name: 'Dr. L. Brandt', short: 'L. Brandt', baselineId: 'C002' },
  { id: 'sato', name: 'M. Sato', short: 'M. Sato', baselineId: 'C003' },
  { id: 'diaz', name: 'R. Diaz', short: 'R. Diaz', baselineId: 'C004' },
];

export const crewName = (id: CrewId) => CREW.find((c) => c.id === id)!.name;
