import { useCockpitData } from '../../api/CockpitData';
import type { SuitResult } from '../../api/bff';
import { useState, useRef, useEffect, useMemo } from 'react';
import { AviaTwinController, type PartData } from './AviaTwinModel';
import { bff, type Twin } from '../../api/bff';
import { SuitIntegrityPanel } from './SuitIntegrityPanel';

export type LayerKey = 'skeletal' | 'cardio' | 'dermal';

interface MetricDef {
  k: string;
  unit: string;
  v: number;
  r: number;
  d: number;
  warn?: number;
  crit?: number;
  dir: number; // 1: higher is worse, -1: lower is worse
}

interface PartDef {
  name: string;
  m: MetricDef[];
  c: string[];
}

interface LayerDef {
  label: string;
  caption: string;
  parts: Record<string, PartDef>;
}

export const LAYERS: Record<LayerKey, LayerDef> = {
  skeletal: {
    label: 'Skeletal',
    caption: 'Mechanical load map',
    parts: {
      hips: {
        name: 'Femoral neck',
        m: [
          {
            k: 'Bone mineral density',
            unit: 'g/cm²',
            v: 0.94,
            r: -0.0013,
            d: 3,
            warn: 0.92,
            crit: 0.87,
            dir: -1,
          },
          {
            k: 'Urinary calcium',
            unit: 'mg/day',
            v: 248,
            r: 0.9,
            d: 0,
            warn: 270,
            crit: 300,
            dir: 1,
          },
        ],
        c: [
          'ARED squat, progressive load +5% weekly',
          'Vitamin D 800 IU + bisphosphonate per flight surgeon',
          'Re-scan with on-board ultrasound in 7 days',
        ],
      },
      spine: {
        name: 'Lumbar spine L1–L4',
        m: [
          {
            k: 'Bone mineral density',
            unit: 'g/cm²',
            v: 1.12,
            r: -0.0009,
            d: 3,
            warn: 1.08,
            crit: 1.02,
            dir: -1,
          },
          { k: 'Axial load vs 1 g', unit: '%', v: 38, r: 0, d: 0, dir: -1 },
        ],
        c: [
          'ARED deadlift, 3 × 8 at 85% load, daily',
          'Axial loading suit for 20 min during work block',
        ],
      },
      legs: {
        name: 'Tibia & fibula',
        m: [
          {
            k: 'Trabecular loss',
            unit: '%',
            v: 1.4,
            r: 0.035,
            d: 1,
            warn: 2.5,
            crit: 3.5,
            dir: 1,
          },
        ],
        c: [
          'Treadmill with harness at 70% body weight, 30 min',
          'Heel-drop impact set, 50 reps',
        ],
      },
      skull: {
        name: 'Skull',
        m: [
          {
            k: 'Cranial BMD',
            unit: 'g/cm²',
            v: 1.82,
            r: 0.0002,
            d: 2,
            warn: 1.95,
            crit: 2.05,
            dir: 1,
          },
        ],
        c: ['No action; cranial bone typically gains density in microgravity'],
      },
      cervical: {
        name: 'Cervical spine C1–C7',
        m: [
          {
            k: 'Disc height',
            unit: 'mm',
            v: 5.1,
            r: 0.004,
            d: 2,
            warn: 5.5,
            crit: 5.9,
            dir: 1,
          },
          {
            k: 'Neck pain score',
            unit: '0–10',
            v: 1,
            r: 0.02,
            d: 1,
            warn: 3,
            crit: 6,
            dir: 1,
          },
        ],
        c: [
          'Neck isometrics, 3 × 30 s each direction',
          'Check sleep-station pillow height',
        ],
      },
      femur: {
        name: 'Femur (Weight-bearing)',
        m: [
          {
            k: 'Bone mineral density',
            unit: 'g/cm²',
            v: 1.02,
            r: -0.0011,
            d: 3,
            warn: 0.98,
            crit: 0.93,
            dir: -1,
          },
          {
            k: 'Quad strength',
            unit: 'Nm',
            v: 182,
            r: -0.25,
            d: 0,
            warn: 170,
            crit: 155,
            dir: -1,
          },
        ],
        c: [
          'ARED squat, 4 × 8 at 80% load',
          'Leg press on resistive device, 3 × 12',
        ],
      },
      humerus: {
        name: 'Humerus',
        m: [
          {
            k: 'Bone mineral density',
            unit: 'g/cm²',
            v: 0.88,
            r: -0.0003,
            d: 3,
            warn: 0.85,
            crit: 0.81,
            dir: -1,
          },
        ],
        c: ['ARED bench press, 3 × 10'],
      },
      radius: {
        name: 'Radius & ulna',
        m: [
          {
            k: 'Bone mineral density',
            unit: 'g/cm²',
            v: 0.69,
            r: -0.0002,
            d: 3,
            warn: 0.66,
            crit: 0.63,
            dir: -1,
          },
          {
            k: 'Grip strength',
            unit: 'kg',
            v: 44,
            r: -0.03,
            d: 1,
            warn: 40,
            crit: 35,
            dir: -1,
          },
        ],
        c: ['Grip trainer, 3 × 20 per hand'],
      },
    },
  },
  cardio: {
    label: 'Cardiovascular',
    caption: 'Fluid shift',
    parts: {
      chest: {
        name: 'Heart & Left Ventricle',
        m: [
          {
            k: 'Stroke volume',
            unit: 'mL',
            v: 64,
            r: -0.08,
            d: 1,
            warn: 60,
            crit: 55,
            dir: -1,
          },
          {
            k: 'Resting HR',
            unit: 'bpm',
            v: 66,
            r: 0.05,
            d: 0,
            warn: 75,
            crit: 85,
            dir: 1,
          },
        ],
        c: [
          'Cycle ergometer intervals, 4 × 4 min at 85% HRmax',
          'Fluid and salt loading 48 h before deceleration',
        ],
      },
      head: {
        name: 'Head · intracranial & SANS',
        m: [
          {
            k: 'Optic nerve sheath',
            unit: 'mm',
            v: 5.6,
            r: 0.006,
            d: 2,
            warn: 5.8,
            crit: 6.2,
            dir: 1,
          },
          {
            k: 'Jugular venous flow',
            unit: 'cm/s',
            v: 21,
            r: -0.04,
            d: 1,
            warn: 19,
            crit: 16,
            dir: -1,
          },
        ],
        c: [
          'Lower-body negative pressure, 4 h/day',
          'Thigh cuffs during sleep period',
          'Fundoscopy image at next check-in',
        ],
      },
      neck: {
        name: 'Carotid & jugular',
        m: [
          {
            k: 'Carotid flow',
            unit: 'mL/s',
            v: 7.2,
            r: -0.01,
            d: 1,
            warn: 6.5,
            crit: 5.8,
            dir: -1,
          },
          {
            k: 'Jugular cross-section',
            unit: 'mm²',
            v: 62,
            r: 0.25,
            d: 0,
            warn: 80,
            crit: 95,
            dir: 1,
          },
        ],
        c: [
          'Ultrasound jugular scan weekly',
          'Lower-body negative pressure, 4 h/day',
        ],
      },
      arms: {
        name: 'Brachial circulation',
        m: [
          {
            k: 'Arm blood pressure',
            unit: 'mmHg sys',
            v: 118,
            r: 0.04,
            d: 0,
            warn: 135,
            crit: 150,
            dir: 1,
          },
        ],
        c: ['Resting BP check, morning and evening'],
      },
      pelvis: {
        name: 'Pelvic venous return',
        m: [
          {
            k: 'IVC diameter',
            unit: 'mm',
            v: 17,
            r: -0.02,
            d: 1,
            warn: 15,
            crit: 13,
            dir: -1,
          },
        ],
        c: ['Hydration target 2.5 L/day'],
      },
      thigh: {
        name: 'Femoral vessels',
        m: [
          {
            k: 'Femoral vein flow',
            unit: 'cm/s',
            v: 14,
            r: -0.03,
            d: 1,
            warn: 12,
            crit: 10,
            dir: -1,
          },
        ],
        c: ['Thigh cuffs during sleep period'],
      },
      legs: {
        name: 'Calves & lower vascular bed',
        m: [
          {
            k: 'Calf volume change',
            unit: '%',
            v: -11,
            r: -0.06,
            d: 1,
            warn: -14,
            crit: -18,
            dir: -1,
          },
        ],
        c: ['Calf raise set, 3 × 20, twice daily'],
      },
    },
  },
  dermal: {
    label: 'Dermal',
    caption: 'Immune rash pinpointing',
    parts: {
      forearm: {
        name: 'Left forearm lesion',
        m: [
          {
            k: 'Rash area',
            unit: 'cm²',
            v: 4.2,
            r: 0.06,
            d: 1,
            warn: 3,
            crit: 8,
            dir: 1,
          },
          {
            k: 'Skin temperature Δ',
            unit: '°C',
            v: 0.6,
            r: 0.004,
            d: 1,
            warn: 1,
            crit: 1.5,
            dir: 1,
          },
        ],
        c: [
          'Photograph site daily with Pulse camera',
          'Topical hydrocortisone 1%, twice daily',
          'Swab and run on-board PCR panel',
        ],
      },
      torso: {
        name: 'Torso skin barrier',
        m: [
          {
            k: 'Water loss (TEWL)',
            unit: 'g/m²h',
            v: 14,
            r: 0.03,
            d: 1,
            warn: 18,
            crit: 24,
            dir: 1,
          },
        ],
        c: ['Emollient after hygiene routine'],
      },
      face: {
        name: 'Face & scalp',
        m: [
          {
            k: 'Facial puffiness',
            unit: 'mm',
            v: 2.1,
            r: 0.01,
            d: 1,
            warn: 3,
            crit: 4,
            dir: 1,
          },
        ],
        c: ['Daily face photo with Pulse camera'],
      },
      arms: {
        name: 'Upper arms & right forearm',
        m: [
          {
            k: 'Skin hydration',
            unit: 'AU',
            v: 42,
            r: -0.05,
            d: 0,
            warn: 38,
            crit: 32,
            dir: -1,
          },
        ],
        c: ['Emollient after hygiene routine'],
      },
      lower: {
        name: 'Hips & thighs',
        m: [
          {
            k: 'Skin thickness',
            unit: 'mm',
            v: 1.6,
            r: -0.002,
            d: 2,
            warn: 1.5,
            crit: 1.4,
            dir: -1,
          },
          {
            k: 'Bruising sites',
            unit: 'count',
            v: 0,
            r: 0.01,
            d: 0,
            warn: 2,
            crit: 4,
            dir: 1,
          },
        ],
        c: ['Inspect harness contact points after treadmill'],
      },
      shins: {
        name: 'Shins & feet',
        m: [
          {
            k: 'Plantar skin peel',
            unit: 'cm²',
            v: 3,
            r: 0.04,
            d: 1,
            warn: 5,
            crit: 8,
            dir: 1,
          },
        ],
        c: ['Foot emollient nightly', 'Check treadmill shoe fit'],
      },
    },
  },
};

export const ANATOMICAL_REGION_TABS = [
  {
    id: 'left',
    label: 'Left',
    partByLayer: { dermal: 'forearm', skeletal: 'radius', cardio: 'arms' },
  },
  {
    id: 'torso',
    label: 'Torso',
    partByLayer: { dermal: 'torso', skeletal: 'spine', cardio: 'chest' },
  },
  {
    id: 'face',
    label: 'Face',
    partByLayer: { dermal: 'face', skeletal: 'skull', cardio: 'head' },
  },
  {
    id: 'upper',
    label: 'Upper',
    partByLayer: { dermal: 'arms', skeletal: 'humerus', cardio: 'neck' },
  },
  {
    id: 'hips',
    label: 'Hips',
    partByLayer: { dermal: 'lower', skeletal: 'hips', cardio: 'pelvis' },
  },
  {
    id: 'shins',
    label: 'Shins',
    partByLayer: { dermal: 'shins', skeletal: 'legs', cardio: 'legs' },
  },
];

export const REGION_MAP: Record<LayerKey, Record<string, string>> = {
  skeletal: {
    head: 'skull',
    neck: 'cervical',
    torso: 'spine',
    pelvis: 'hips',
    thL: 'femur',
    thR: 'femur',
    shL: 'legs',
    shR: 'legs',
    uaL: 'humerus',
    uaR: 'humerus',
    faL: 'radius',
    faR: 'radius',
  },
  cardio: {
    head: 'head',
    neck: 'neck',
    torso: 'chest',
    pelvis: 'pelvis',
    thL: 'thigh',
    thR: 'thigh',
    shL: 'legs',
    shR: 'legs',
    uaL: 'arms',
    uaR: 'arms',
    faL: 'arms',
    faR: 'arms',
  },
  dermal: {
    head: 'face',
    neck: 'face',
    torso: 'torso',
    pelvis: 'lower',
    thL: 'lower',
    thR: 'lower',
    shL: 'shins',
    shR: 'shins',
    uaL: 'arms',
    uaR: 'arms',
    faL: 'forearm',
    faR: 'arms',
  },
};

function mval(m: MetricDef, day: number, k: number): number {
  return m.v + m.r * k * day;
}

function mstat(m: MetricDef, x: number): 'nom' | 'warn' | 'crit' {
  if (m.warn == null) return 'nom';
  if (m.dir < 0) {
    if (m.crit != null && x <= m.crit) return 'crit';
    if (x <= m.warn) return 'warn';
    return 'nom';
  } else {
    if (m.crit != null && x >= m.crit) return 'crit';
    if (x >= m.warn) return 'warn';
    return 'nom';
  }
}

function pstat(p: PartDef, day: number, k: number): 'nom' | 'warn' | 'crit' {
  const rank: Record<string, number> = { nom: 0, warn: 1, crit: 2 };
  return p.m.reduce<'nom' | 'warn' | 'crit'>((worst, m) => {
    const s = mstat(m, mval(m, day, k));
    return rank[s] > rank[worst] ? s : worst;
  }, 'nom');
}

/**
 * Overlay backend values on the metric table: femoral / lumbar BMD from the skeletal heuristic bridge (OSD-919
 * uncoupling x adherence) and the cardiac encoder's anomaly probability. The backend's BMD loss rate already
 * includes the slider's adherence, so it is divided by kRate (mval multiplies by it again).
 */
function withModelData(
  twin: Twin | null,
  kRate: number,
): Record<LayerKey, LayerDef> {
  if (!twin) return LAYERS;
  const { femoral, lumbar } = twin.skeletal_risk_projection.regions;
  const setMetric = (
    p: PartDef,
    k: string,
    patch: Partial<MetricDef>,
  ): PartDef => ({
    ...p,
    m: p.m.map((m) => (m.k === k ? { ...m, ...patch } : m)),
  });
  const sk = LAYERS.skeletal.parts;
  const cv = LAYERS.cardio.parts;
  const prob = twin.cardiovascular.cardiac_anomaly_prob;
  return {
    ...LAYERS,
    skeletal: {
      ...LAYERS.skeletal,
      parts: {
        ...sk,
        hips: setMetric(sk.hips, 'Bone mineral density', {
          v: femoral.today_bmd,
          r: -femoral.rate_per_day / kRate,
        }),
        spine: setMetric(sk.spine, 'Bone mineral density', {
          v: lumbar.today_bmd,
          r: -lumbar.rate_per_day / kRate,
        }),
      },
    },
    cardio: {
      ...LAYERS.cardio,
      parts: {
        ...cv,
        chest:
          prob == null
            ? cv.chest
            : {
                ...cv.chest,
                m: [
                  ...cv.chest.m,
                  {
                    k: 'Cardiac anomaly prob',
                    unit: '',
                    v: prob,
                    r: 0,
                    d: 2,
                    warn: 0.4,
                    crit: 0.7,
                    dir: 1,
                  },
                ],
              },
      },
    },
  };
}

const STAT_LABELS: Record<
  'nom' | 'warn' | 'crit',
  { label: string; color: string; bg: string }
> = {
  nom: { label: 'Nominal', color: '#5EE0A8', bg: 'rgba(94, 224, 168, 0.14)' },
  warn: { label: 'Warning', color: '#F5B94A', bg: 'rgba(245, 185, 74, 0.16)' },
  crit: { label: 'Critical', color: '#FF5C6C', bg: 'rgba(255, 92, 108, 0.18)' },
};

function isRegionActive(
  regionId: string,
  activeKey: string,
  layer: LayerKey,
): boolean {
  if (layer === 'dermal') {
    const map: Record<string, string> = {
      left: 'forearm',
      torso: 'torso',
      face: 'face',
      upper: 'arms',
      hips: 'lower',
      shins: 'shins',
    };
    return map[regionId] === activeKey;
  }
  if (layer === 'skeletal') {
    const map: Record<string, string[]> = {
      left: ['radius'],
      torso: ['spine'],
      face: ['skull', 'cervical'],
      upper: ['humerus'],
      hips: ['hips', 'femur'],
      shins: ['legs'],
    };
    return map[regionId]?.includes(activeKey) ?? false;
  }
  if (layer === 'cardio') {
    const map: Record<string, string[]> = {
      left: ['arms'],
      torso: ['chest'],
      face: ['head'],
      upper: ['neck'],
      hips: ['pelvis', 'thigh'],
      shins: ['legs'],
    };
    return map[regionId]?.includes(activeKey) ?? false;
  }
  return false;
}

export function DigitalTwinView({
  activeCrew = 'okafor',
  theme = 'dark',
}: {
  activeCrew?: string;
  theme?: 'dark' | 'light';
}) {
  const { crew } = useCockpitData();
  const updatedAt = crew.find((c) => c.id === activeCrew)?.updatedAt;
  const [suit, setSuit] = useState<SuitResult | null>(null);
  const [twinError, setTwinError] = useState<string | null>(null);
  const [layer, setLayer] = useState<LayerKey>('dermal');
  const [selectedPartKey, setSelectedPartKey] = useState<string>('torso');
  const [day, setDay] = useState<number>(0); // 0 to 60 days
  const [adherence, setAdherence] = useState<number>(70); // 10% to 100%
  const [xray, setXray] = useState<number>(70);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [viewAngle, setViewAngle] = useState<{
    name: 'front' | 'side' | 'back' | 'reset';
    n: number;
  }>({
    name: 'front',
    n: 0,
  });
  const [pushedMap, setPushedMap] = useState<Record<string, boolean>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AviaTwinController | null>(null);

  const [twin, setTwin] = useState<Twin | null>(null);

  // Re-evaluate the backend projection for the selected crew member as the WHAT-IF slider moves (debounced).
  useEffect(() => {
    let active = true;
    const id = setTimeout(() => {
      bff
        .twin(activeCrew, adherence)
        .then((t) => {
          if (active) {
            setTwin(t);
            setTwinError(null);
          }
        })
        .catch((e: Error) => {
          if (active) {
            setTwin(null);
            setTwinError(e.message);
          }
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [activeCrew, adherence, updatedAt]);

  // Degradation rate multiplier based on countermeasure adherence
  const kRate = 1.0 * (1 + ((70 - adherence) / 100) * 1.2);
  const heartRate = twin?.heart_rate ?? 0;

  const horizon = 60;
  const layers = useMemo(() => withModelData(twin, kRate), [twin, kRate]);
  const currentLayer = layers[layer];
  const activePartKey = currentLayer.parts[selectedPartKey]
    ? selectedPartKey
    : Object.keys(currentLayer.parts)[0];
  const activePart = currentLayer.parts[activePartKey];

  // Status for all parts in the current layer
  const partsState = useMemo<Record<string, PartData>>(() => {
    const res: Record<string, PartData> = {};
    for (const [pk, p] of Object.entries(currentLayer.parts)) {
      const s = pstat(p, day, kRate);
      const tiers = {
        Nominal: 'nom',
        Warning: 'warn',
        Critical: 'crit',
      } as const;
      const map = suit?.digital_twin_body_map;
      const suitTier =
        pk === 'forearm' || pk === 'radius'
          ? map?.left_forearm
          : pk === 'arms' || pk === 'humerus'
            ? map?.right_forearm
            : pk === 'legs' || pk === 'hips' || pk === 'femur'
              ? map?.lower_body_femoral
              : pk === 'torso' || pk === 'chest'
                ? map?.torso_cardiopulmonary
                : undefined;
      const effective = suitTier ? tiers[suitTier] : s;
      res[pk] = {
        name: p.name,
        status: effective,
        label: STAT_LABELS[effective].label,
      };
    }
    return res;
  }, [currentLayer, day, kRate, suit]);

  // Status for the active part
  const activePartStatus = pstat(activePart, day, kRate);

  // Calculate ETA for warning / critical thresholds
  const etaPrognosis = useMemo(() => {
    let wDay: number | null = null;
    let cDay: number | null = null;
    for (let d = 0; d <= horizon; d++) {
      const s = pstat(activePart, d, kRate);
      if (wDay === null && s !== 'nom') wDay = d;
      if (s === 'crit') {
        cDay = d;
        break;
      }
    }

    if (wDay === null) {
      return {
        text: `Stays nominal through +${horizon} d`,
        color: '#5EE0A8',
      };
    }
    if (wDay === 0) {
      if (cDay === 0)
        return { text: 'Critical threshold reached today', color: '#FF5C6C' };
      return {
        text: `Already at warning threshold${cDay !== null ? ` · critical at +${cDay} d` : ''}`,
        color: cDay !== null && cDay <= 20 ? '#FF5C6C' : '#F5B94A',
      };
    }
    return {
      text: `Warning threshold at +${wDay} d${cDay !== null ? ` · critical at +${cDay} d` : ''}`,
      color: cDay !== null && cDay <= 30 ? '#FF5C6C' : '#F5B94A',
    };
  }, [activePart, kRate, horizon]);

  // Mount 3D Controller
  useEffect(() => {
    if (!containerRef.current) return;

    const ctrl = new AviaTwinController(
      containerRef.current,
      {
        layer,
        mode: theme,
        regionPart: REGION_MAP[layer],
        sel: activePartKey,
        xray,
        auto: autoRotate,
        view: viewAngle,
        hr: heartRate,
        parts: partsState,
      },
      (partKey) => {
        setSelectedPartKey(partKey);
      },
    );

    controllerRef.current = ctrl;

    return () => {
      ctrl.destroy();
      controllerRef.current = null;
    };
  }, []);

  // Update 3D Controller state
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.update({
        layer,
        mode: theme,
        regionPart: REGION_MAP[layer],
        sel: activePartKey,
        xray,
        auto: autoRotate,
        view: viewAngle,
        hr: heartRate,
        parts: partsState,
      });
    }
  }, [
    theme,
    layer,
    activePartKey,
    xray,
    autoRotate,
    viewAngle,
    partsState,
    heartRate,
  ]);

  // Push countermeasures action
  const pushKey = `${activeCrew}:${layer}:${activePartKey}`;
  const isPushed = !!pushedMap[pushKey];

  const handlePushCountermeasures = async () => {
    try {
      // Appends the prescription to Today's countermeasures (Overview) for this crew member.
      await bff.addCountermeasure(
        'Review ' +
          activePart.name +
          ' observations with the mission medical officer',
        activeCrew,
      );
      setPushedMap((prev) => ({ ...prev, [pushKey]: true }));
      setToastMsg(
        'Review task saved to the shared schedule. Pulse will load it from the backend.',
      );
    } catch (e) {
      setToastMsg(`Could not sync prescription: ${(e as Error).message}`);
    }
    setTimeout(() => setToastMsg(null), 3500);
  };

  return (
    <div className="view-enter" style={{ position: 'relative' }}>
      <div className="platform-card" role="status">
        Interactive illustration · femoral/lumbar values use a heuristic
        projection; other anatomical values are illustrative scenario constants.
        Suit region colors combine an existing classifier with threshold rules.
        This view does not measure anatomy or prescribe treatment.
        {twinError && (
          <p role="alert">
            Projection unavailable: {twinError}. Illustrative values only.
          </p>
        )}
        {!twin && !twinError && (
          <p>Loading projection; illustration is not a current assessment.</p>
        )}
      </div>
      {/* Toast alert */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: 'var(--surface-raised)',
            color: 'var(--text-1)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
            borderRadius: 12,
            padding: '12px 20px',
            font: "400 13px/1.4 'Space Grotesk', sans-serif",
            backdropFilter: 'blur(16px)',
            animation: 'fadeIn 0.25s ease',
          }}
        >
          {toastMsg}
        </div>
      )}

      <div className="twin-layout">
        {/* ── Left Main Digital Twin 3D Viewport Tile ────────────── */}
        <div
          className="tile"
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            minHeight: 0,
            height: '100%',
            borderRadius: 16,
            overflow: 'hidden',
            padding: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Top Header Bar — Clean Single-Row HUD matching Analytics / Alerts */}
          <div
            className="twin-header-bar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-raised)',
              zIndex: 5,
              minHeight: 56,
              boxSizing: 'border-box',
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 0,
              }}
            >
              <span
                className="view-title"
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                Digital Twin
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  color: 'var(--text-3)',
                  fontWeight: 400,
                  whiteSpace: 'nowrap',
                }}
              >
                · Day 142
              </span>
            </div>

            {/* Layer switcher tabs styled identically to range-tabs / filter-tabs */}
            <div className="range-tabs" style={{ margin: 0, flexShrink: 0 }}>
              {(['skeletal', 'cardio', 'dermal'] as const).map((lKey) => {
                const isActive = layer === lKey;
                const def = LAYERS[lKey];
                return (
                  <button
                    key={lKey}
                    id={`twin-layer-${lKey}`}
                    className={`range-tab${isActive ? ' range-tab--active' : ''}`}
                    onClick={() => {
                      setLayer(lKey);
                      setSelectedPartKey(Object.keys(LAYERS[lKey].parts)[0]);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{def.label}</span>
                    {lKey === 'dermal' && (
                      <span
                        className="chip"
                        style={{
                          fontSize: 9,
                          padding: '1px 5px',
                          lineHeight: '11px',
                          border: '1px solid currentColor',
                          opacity: isActive ? 1 : 0.75,
                        }}
                      >
                        Scan
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3D Viewport container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              minHeight: 200,
              background: 'transparent',
              overflow: 'hidden',
            }}
          >
            {/* The 3D Human Model canvas mount container */}
            <div
              ref={containerRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
              }}
            />

            {/* Top-Left View Controls HUD */}
            <div
              className="twin-view-controls-hud"
              style={{
                position: 'absolute',
                left: 18,
                top: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                zIndex: 4,
                pointerEvents: 'auto',
              }}
            >
              <div className="twin-view-controls">
                {(['front', 'side', 'back', 'reset'] as const).map((angle) => {
                  const isActive =
                    viewAngle.name === angle && angle !== 'reset';
                  return (
                    <button
                      key={angle}
                      onClick={() =>
                        setViewAngle((prev) => ({ name: angle, n: prev.n + 1 }))
                      }
                      className={`twin-view-controls__btn${isActive ? ' twin-view-controls__btn--active' : ''}`}
                    >
                      {angle}
                    </button>
                  );
                })}
              </div>
              <span
                className="twin-instruction-text"
                style={{
                  fontSize: 10,
                  color: 'var(--text-2)',
                  fontWeight: 600,
                  paddingLeft: 6,
                  pointerEvents: 'none',
                }}
              >
                Drag to rotate · scroll to zoom · double-click to reset
              </span>
            </div>

            {/* Top-Right Status Legend HUD */}
            <div
              className="twin-legend-hud"
              style={{
                position: 'absolute',
                right: 18,
                top: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                padding: '10px 14px',
                background: 'var(--surface-raised)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                zIndex: 4,
                pointerEvents: 'none',
              }}
            >
              <span
                className="label"
                style={{
                  fontSize: 9,
                  color: 'var(--text-2)',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  marginBottom: 2,
                }}
              >
                {currentLayer.caption.toUpperCase()}
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 11,
                  color: 'var(--text-1)',
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#5EE0A8',
                  }}
                />
                Nominal
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 11,
                  color: 'var(--text-1)',
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#F5B94A',
                  }}
                />
                Warning
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 11,
                  color: 'var(--text-1)',
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#FF5C6C',
                  }}
                />
                Critical
              </div>
            </div>

            {/* Bottom-Left X-ray & Auto-Rotate HUD */}
            <div
              className="twin-bottom-hud"
              style={{
                position: 'absolute',
                left: 18,
                bottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '8px 14px',
                background: 'var(--surface-raised)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                zIndex: 4,
                pointerEvents: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className="label"
                  style={{
                    fontSize: 10,
                    color: 'var(--text-2)',
                    fontWeight: 500,
                  }}
                >
                  X-RAY
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={xray}
                  onChange={(e) => setXray(Number(e.target.value))}
                  style={{
                    width: 100,
                    accentColor: '#143493',
                    height: 4,
                    cursor: 'pointer',
                  }}
                  aria-label="X-ray transparency slider"
                />
              </div>

              <span
                style={{ width: 1, height: 16, background: 'var(--border)' }}
              />

              <button
                onClick={() => setAutoRotate((prev) => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  border: 'none',
                  color: autoRotate ? 'var(--text-1)' : 'var(--text-2)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  padding: 0,
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 16,
                    borderRadius: 999,
                    background: autoRotate ? 'var(--glow)' : 'var(--border)',
                    position: 'relative',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: autoRotate ? 14 : 2,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: '#FFFFFF',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                    }}
                  />
                </span>
                Auto-rotate
              </button>
            </div>
          </div>

          {/* Bottom Docked Predictive Timeline Bar — Responsive & Unclipped */}
          <div
            className="twin-timeline-bar"
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-raised)',
              zIndex: 5,
              minHeight: 62,
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <div
              className="twin-timeline-meta"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                flexShrink: 0,
              }}
            >
              <div
                className="label"
                style={{
                  fontSize: 9.5,
                  color: 'var(--text-3)',
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                }}
              >
                PREDICTIVE TIMELINE
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-title)',
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  letterSpacing: '0.03em',
                  whiteSpace: 'nowrap',
                }}
              >
                {day === 0 ? 'Today · Day 142' : `+${day}d · Day ${142 + day}`}
              </div>
            </div>

            <div
              className="twin-timeline-slider-box"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
              }}
            >
              <input
                id="digital-twin-timeline-slider"
                type="range"
                min={0}
                max={horizon}
                step={1}
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  accentColor: '#143493',
                  height: 4,
                  background: 'var(--border)',
                  borderRadius: 2,
                }}
                aria-label="Predictive mission timeline slider"
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  gap: 8,
                }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>Day 142 (Today)</span>
                <span style={{ whiteSpace: 'nowrap' }}>+30d (EVA-3)</span>
                <span style={{ whiteSpace: 'nowrap' }}>+{horizon}d (Mars)</span>
              </div>
            </div>

            <button
              className="twin-timeline-reset-btn"
              onClick={() => setDay(0)}
              style={{
                background: day === 0 ? 'var(--surface)' : 'var(--glow)',
                border: `1px solid ${day === 0 ? 'var(--border)' : 'var(--glow)'}`,
                color: day === 0 ? 'var(--text-3)' : '#FFFFFF',
                borderRadius: 'var(--r-pill)',
                padding: '6px 14px',
                fontSize: 11,
                cursor: day === 0 ? 'default' : 'pointer',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease',
                boxShadow: 'none',
              }}
            >
              Back to today
            </button>
          </div>
        </div>

        {/* ── Right Telemetry & What-If Deep Drill Panel ──────────── */}
        <aside
          className="twin-panel"
          style={{
            borderRadius: 16,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: 0,
            gap: 0,
          }}
        >
          {/* Deep Drill Top Title Header */}
          <div
            style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-raised)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                className="label"
                style={{
                  fontSize: 10,
                  color: 'var(--text-3)',
                  letterSpacing: '0.08em',
                }}
              >
                {currentLayer.label.toUpperCase()} · DEEP DRILL
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 400,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: STAT_LABELS[activePartStatus].bg,
                  color: STAT_LABELS[activePartStatus].color,
                  border: `1px solid ${STAT_LABELS[activePartStatus].color}40`,
                }}
              >
                {STAT_LABELS[activePartStatus].label} ·{' '}
                {day === 0 ? 'Today' : `+${day} d`}
              </span>
            </div>

            <span
              className="twin-detail-title"
              style={{
                fontFamily: 'var(--font-title)',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--text-1)',
                letterSpacing: '0.04em',
                lineHeight: 1.2,
              }}
            >
              {activePart.name}
            </span>
          </div>

          {/* Quick anatomical region tabs — strictly fixed gap & non-responsive */}
          <div
            className="twin-region-tabs"
            style={{
              flexShrink: 0,
              flexGrow: 0,
              flex: '0 0 58px',
              height: 58,
              minHeight: 58,
              maxHeight: 58,
              boxSizing: 'border-box',
            }}
          >
            {ANATOMICAL_REGION_TABS.map((tab) => {
              const targetKey = tab.partByLayer[layer] || tab.id;
              const s = partsState[targetKey]?.status || 'nom';
              const isSelected = isRegionActive(tab.id, activePartKey, layer);
              return (
                <button
                  key={tab.id}
                  id={`twin-region-${tab.id}`}
                  onClick={() => setSelectedPartKey(targetKey)}
                  className={`twin-region-btn${isSelected ? ' twin-region-btn--active' : ''}`}
                  title={`${tab.label} (${currentLayer.parts[targetKey]?.name || targetKey})`}
                >
                  <span
                    className="twin-region-btn__dot"
                    style={{ background: STAT_LABELS[s].color }}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Telemetry Metrics Table */}
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 68px 84px',
                gap: 8,
                fontSize: 9,
                color: 'var(--text-3)',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              <span>METRIC</span>
              <span style={{ textAlign: 'right' }}>TODAY</span>
              <span style={{ textAlign: 'right' }}>
                {day === 0 ? 'BASELINE' : `+${day} D PROJ`}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activePart.m.map((metric) => {
                const proj = mval(metric, day, kRate);
                const s = mstat(metric, proj);
                return (
                  <div
                    key={metric.k}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 68px 84px',
                      gap: 8,
                      alignItems: 'baseline',
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text-1)',
                        }}
                      >
                        {metric.k}
                      </div>
                      <div
                        className="caption"
                        style={{ fontSize: 9, color: 'var(--text-3)' }}
                      >
                        {metric.unit}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: 'right',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-2)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {metric.v.toFixed(metric.d)}
                    </div>

                    <div
                      style={{
                        textAlign: 'right',
                        fontSize: 13,
                        fontWeight: 600,
                        color: STAT_LABELS[s].color,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {proj.toFixed(metric.d)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* What-If Countermeasure Adherence Simulation */}
          <div
            className="twin-whatif-card"
            style={{
              margin: '16px 20px',
              padding: '14px 16px',
              borderRadius: 12,
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span
                className="label"
                style={{
                  fontSize: 10,
                  color: 'var(--text-3)',
                  letterSpacing: '0.08em',
                }}
              >
                WHAT-IF · ADHERENCE SIMULATION
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {adherence}%
              </span>
            </div>

            <input
              id="whatif-adherence-slider"
              type="range"
              min={10}
              max={100}
              step={5}
              value={adherence}
              onChange={(e) => setAdherence(Number(e.target.value))}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: '#143493',
                height: 4,
                background: 'var(--border)',
                borderRadius: 2,
              }}
              aria-label="Countermeasure adherence slider"
            />

            <div
              style={{
                fontSize: 11,
                lineHeight: 1.45,
                fontWeight: 400,
                color: etaPrognosis.color,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                padding: '6px 10px',
                borderRadius: 6,
              }}
            >
              {etaPrognosis.text}
            </div>
          </div>

          {/* Suit integrity & regional pressure (suit swelling encoder) */}
          <SuitIntegrityPanel
            key={activeCrew}
            crewId={activeCrew}
            onResult={setSuit}
          />

          {/* Prescribed Countermeasures List */}
          <div
            className="twin-countermeasures-card"
            style={{
              padding: '0 20px 20px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 'auto',
            }}
          >
            <span
              className="label"
              style={{
                fontSize: 10,
                color: 'var(--text-3)',
                letterSpacing: '0.08em',
              }}
            >
              REVIEW ACTION
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                'Review the entered observation and units; use only the individual’s approved mission plan. Contact the mission medical officer for concerning changes.',
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '22px 1fr',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    alignItems: 'start',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: '#1C4FD7',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    0{idx + 1}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      lineHeight: 1.4,
                      color: 'var(--text-2)',
                      fontWeight: 400,
                    }}
                  >
                    {item}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handlePushCountermeasures}
              disabled={isPushed}
              style={{
                marginTop: 8,
                background: isPushed
                  ? 'rgba(94, 224, 168, 0.2)'
                  : 'var(--glow)',
                border: `1px solid ${isPushed ? '#5EE0A8' : 'var(--glow)'}`,
                color: isPushed ? '#5EE0A8' : '#FFFFFF',
                borderRadius: 'var(--r-pill)',
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: isPushed ? 'default' : 'pointer',
                fontFamily: 'var(--font-sans)',
                boxShadow: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {isPushed ? 'Review task saved ✓' : 'Assign review task →'}
            </button>
            <span
              className="caption"
              style={{
                fontSize: 9,
                color: 'var(--text-3)',
                textAlign: 'center',
              }}
            >
              Saves a software task for this crew member. No hardware connection
              is used.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
