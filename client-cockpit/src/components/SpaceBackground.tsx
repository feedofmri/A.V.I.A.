import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  color: string;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  layer: number; // 1 (distant), 2 (mid), 3 (near)
}

interface Meteor {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  life: number;
  maxLife: number;
  thickness: number;
  sparkColor: string;
}

interface Shuttle {
  x: number;
  y: number;
  speed: number;
  angle: number;
  scale: number;
  thrustPulse: number;
  beaconTimer: number;
  active: boolean;
}

interface NebulaCloud {
  x: number;
  y: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
  baseRadius: number;
  pulsePhase: number;
}

// Subtle realistic NASA star spectral colors
const STAR_COLORS = [
  '#FFFFFF', // O/A White
  '#E6F2F7', // Ice Blue
  '#D2E7F0', // #295f75 tinted pale blue
  '#FEF6E9', // Solar Warm White
  '#E0E7FF', // Starlight Violet-White
];

interface SpaceBackgroundProps {
  theme?: 'dark' | 'light';
}

export function SpaceBackground({ theme = 'dark' }: SpaceBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;

    const stars: Star[] = [];
    const meteors: Meteor[] = [];
    const nebulaClouds: NebulaCloud[] = [];

    // NASA Space Shuttle Orbiter State
    const shuttle: Shuttle = {
      x: -120,
      y: 180,
      speed: 0.75,
      angle: 12 * (Math.PI / 180), // 12 deg slight downward cruise
      scale: 0.65,
      thrustPulse: 0,
      beaconTimer: 0,
      active: true,
    };

    function resetShuttle() {
      shuttle.active = true;
      shuttle.x = -100;
      shuttle.y = Math.random() * (height * 0.45) + 60;
      shuttle.speed = Math.random() * 0.35 + 0.65;
      shuttle.angle = (Math.random() * 16 - 4) * (Math.PI / 180);
      shuttle.scale = Math.random() * 0.15 + 0.6;
    }

    // Resize handler
    function resize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx?.scale(dpr, dpr);
      initScene();
    }

    function initScene() {
      stars.length = 0;
      nebulaClouds.length = 0;

      // 1. Generate Stars across 3 depth planes
      const starCount = Math.floor((width * height) / 4200);
      for (let i = 0; i < starCount; i++) {
        const layer = Math.random() < 0.65 ? 1 : Math.random() < 0.88 ? 2 : 3;
        const size = layer === 1 ? Math.random() * 0.8 + 0.4 : layer === 2 ? Math.random() * 1.2 + 0.7 : Math.random() * 1.7 + 1.1;
        const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
        const baseAlpha = layer === 1 ? Math.random() * 0.35 + 0.25 : layer === 2 ? Math.random() * 0.45 + 0.4 : Math.random() * 0.35 + 0.65;

        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size,
          color,
          baseAlpha,
          twinkleSpeed: Math.random() * 0.025 + 0.006,
          twinklePhase: Math.random() * Math.PI * 2,
          layer,
        });
      }

      // 2. Generate Nebulae using #295f75 (aerospace muted blue) and deep space tones
      nebulaClouds.push(
        {
          x: width * 0.82,
          y: height * 0.25,
          baseRadius: Math.max(width, height) * 0.40,
          radius: Math.max(width, height) * 0.40,
          color: 'rgba(41, 95, 117, 0.18)', // #295f75 muted aerospace blue
          vx: 0.02,
          vy: -0.01,
          pulsePhase: 0,
        },
        {
          x: width * 0.18,
          y: height * 0.82,
          baseRadius: Math.max(width, height) * 0.38,
          radius: Math.max(width, height) * 0.38,
          color: 'rgba(28, 68, 84, 0.15)', // deep steel blue
          vx: -0.015,
          vy: 0.015,
          pulsePhase: 1.8,
        },
        {
          x: width * 0.55,
          y: height * 0.45,
          baseRadius: Math.max(width, height) * 0.32,
          radius: Math.max(width, height) * 0.32,
          color: 'rgba(64, 126, 150, 0.08)', // subtle cyan-gray tint
          vx: 0.01,
          vy: 0.02,
          pulsePhase: 3.4,
        }
      );
    }

    function createMeteor(): Meteor {
      const angle = (Math.random() * 20 + 38) * (Math.PI / 180);
      const speed = Math.random() * 12 + 16;
      const startX = Math.random() * (width * 1.2) - width * 0.1;
      const startY = Math.random() * (height * 0.35);

      return {
        x: startX,
        y: startY,
        length: Math.random() * 140 + 90,
        speed,
        angle,
        opacity: 1,
        life: 0,
        maxLife: Math.floor(Math.random() * 40 + 30),
        thickness: Math.random() * 1.2 + 1.2,
        sparkColor: Math.random() < 0.7 ? '#E6F4FA' : '#FFFFFF',
      };
    }

    function onMouseMove(e: MouseEvent) {
      targetMouseX = (e.clientX - width / 2) / (width / 2);
      targetMouseY = (e.clientY - height / 2) / (height / 2);
    }

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    resize();

    let lastMeteorTime = Date.now();
    let meteorInterval = Math.random() * 3000 + 2500; // Frequent meteors every 2.5-5.5s

    // Main animation loop
    function animate() {
      if (!ctx) return;

      // Parallax smooth interpolation
      currentMouseX += (targetMouseX - currentMouseX) * 0.035;
      currentMouseY += (targetMouseY - currentMouseY) * 0.035;

      const isLight = themeRef.current === 'light';

      // Background fill: Pure Solid White in light mode, Solid Void in dark mode (Zero gradients)
      if (isLight) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = '#05070D';
        ctx.fillRect(0, 0, width, height);
      }

      // ── 1. Cosmic Nebulae (#295f75 Palette) ───────────────
      nebulaClouds.forEach((cloud) => {
        cloud.pulsePhase += 0.004;
        cloud.x += cloud.vx;
        cloud.y += cloud.vy;

        if (cloud.x < -cloud.baseRadius) cloud.x = width + cloud.baseRadius;
        if (cloud.x > width + cloud.baseRadius) cloud.x = -cloud.baseRadius;
        if (cloud.y < -cloud.baseRadius) cloud.y = height + cloud.baseRadius;
        if (cloud.y > height + cloud.baseRadius) cloud.y = -cloud.baseRadius;

        const currentRadius = cloud.baseRadius * (1 + 0.06 * Math.sin(cloud.pulsePhase));
        const grad = ctx.createRadialGradient(
          cloud.x + currentMouseX * 12,
          cloud.y + currentMouseY * 12,
          0,
          cloud.x + currentMouseX * 12,
          cloud.y + currentMouseY * 12,
          currentRadius
        );
        if (isLight) {
          grad.addColorStop(0, 'rgba(20, 52, 147, 0.035)');
          grad.addColorStop(0.5, 'rgba(20, 52, 147, 0.015)');
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else {
          grad.addColorStop(0, cloud.color);
          grad.addColorStop(0.5, 'rgba(41, 95, 117, 0.04)');
          grad.addColorStop(1, 'rgba(5, 7, 13, 0)');
        }

        // No background gradients in either mode
        // (Skipped nebula gradient clouds)
      });

      // ── 2. NASA Celestial Horizon Curve (#295f75) ─────────
      ctx.save();
      const horizonY = height * 1.18;
      const horizonRadius = Math.max(width, height) * 0.88;

      ctx.strokeStyle = isLight ? 'rgba(28, 79, 215, 0.16)' : 'rgba(41, 95, 117, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(width * 0.5 + currentMouseX * 18, horizonY + currentMouseY * 12, horizonRadius, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      const limbGrad = ctx.createRadialGradient(
        width * 0.5 + currentMouseX * 18,
        horizonY + currentMouseY * 12,
        horizonRadius - 40,
        width * 0.5 + currentMouseX * 18,
        horizonY + currentMouseY * 12,
        horizonRadius + 25
      );
      if (isLight) {
        limbGrad.addColorStop(0, 'rgba(56, 189, 248, 0.10)');
        limbGrad.addColorStop(0.5, 'rgba(28, 79, 215, 0.04)');
        limbGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      } else {
        limbGrad.addColorStop(0, 'rgba(41, 95, 117, 0.06)');
        limbGrad.addColorStop(0.5, 'rgba(28, 68, 84, 0.03)');
        limbGrad.addColorStop(1, 'rgba(5, 7, 13, 0)');
      }
      // No gradient limb fill
      // (Skipped horizon gradient)
      ctx.restore();

      // ── 3. Starfield with Twinkle & Diffraction Spikes ────
      stars.forEach((star) => {
        star.twinklePhase += star.twinkleSpeed;
        const twinkle = 0.70 + 0.30 * Math.sin(star.twinklePhase);
        const alpha = Math.min(1, Math.max(0.08, star.baseAlpha * twinkle));

        const parallaxFactor = star.layer === 1 ? 6 : star.layer === 2 ? 14 : 26;
        const sx = (star.x - currentMouseX * parallaxFactor + width) % width;
        const sy = (star.y - currentMouseY * parallaxFactor + height) % height;

        ctx.save();
        ctx.globalAlpha = isLight ? alpha * 0.45 : alpha;
        ctx.fillStyle = isLight ? 'rgba(30, 58, 138, 0.35)' : star.color;

        if (star.layer === 3 && star.size > 1.6) {
          ctx.beginPath();
          ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
          ctx.fill();

          if (!isLight) {
            // Clean star dot without radial gradient halo

            // 4-point hairline diffraction spike
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 0.5;
            const spikeLen = star.size * 3.5;
            ctx.beginPath();
            ctx.moveTo(sx - spikeLen, sy);
            ctx.lineTo(sx + spikeLen, sy);
            ctx.moveTo(sx, sy - spikeLen);
            ctx.lineTo(sx, sy + spikeLen);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      // ── 4. NASA Space Shuttle / Deep Space Orbiter ─────────
      if (shuttle.active) {
        shuttle.x += Math.cos(shuttle.angle) * shuttle.speed;
        shuttle.y += Math.sin(shuttle.angle) * shuttle.speed;
        shuttle.thrustPulse += 0.2;
        shuttle.beaconTimer += 0.05;

        // Render Shuttle Craft
        ctx.save();
        ctx.translate(shuttle.x, shuttle.y);
        ctx.rotate(shuttle.angle);
        ctx.scale(shuttle.scale, shuttle.scale);

        // 1) Ion Thruster Engine Plumes (#295f75 + Cyan Glow)
        const plumeLen = 28 + 6 * Math.sin(shuttle.thrustPulse);
        const plumeGrad = ctx.createLinearGradient(-35, 0, -35 - plumeLen, 0);
        if (isLight) {
          plumeGrad.addColorStop(0, '#FFFFFF');
          plumeGrad.addColorStop(0.2, '#38BDF8');
          plumeGrad.addColorStop(0.6, 'rgba(37, 99, 235, 0.7)');
          plumeGrad.addColorStop(1, 'rgba(37, 99, 235, 0)');
        } else {
          plumeGrad.addColorStop(0, '#FFFFFF');
          plumeGrad.addColorStop(0.2, '#B8D5E5');
          plumeGrad.addColorStop(0.6, 'rgba(41, 95, 117, 0.7)');
          plumeGrad.addColorStop(1, 'rgba(41, 95, 117, 0)');
        }

        // Three main engine plumes
        [-4, 0, 4].forEach((ey) => {
          ctx.beginPath();
          ctx.moveTo(-28, ey);
          ctx.lineTo(-28 - plumeLen, ey);
          ctx.strokeStyle = plumeGrad;
          ctx.lineWidth = ey === 0 ? 3.5 : 2.5;
          ctx.lineCap = 'round';
          ctx.stroke();
        });

        // 2) Shuttle Orbiter Fuselage & Wings (Precision Vector Art)
        ctx.fillStyle = isLight ? '#FFFFFF' : '#E2E8F0'; // Ceramic heat tile white
        ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.35)' : 'rgba(41, 95, 117, 0.5)';
        ctx.lineWidth = 0.8;

        // Main body delta shape
        ctx.beginPath();
        ctx.moveTo(34, 0); // Nose cone
        ctx.lineTo(24, -3.5); // Forward fuselage
        ctx.lineTo(0, -6); // Mid fuselage
        ctx.lineTo(-14, -24); // Port wingtip
        ctx.lineTo(-20, -23); // Port elevon
        ctx.lineTo(-24, -6.5); // Engine bay left
        ctx.lineTo(-28, -6); // Aft left
        ctx.lineTo(-28, 6); // Aft right
        ctx.lineTo(-24, 6.5); // Engine bay right
        ctx.lineTo(-20, 23); // Starboard elevon
        ctx.lineTo(-14, 24); // Starboard wingtip
        ctx.lineTo(0, 6); // Mid fuselage right
        ctx.lineTo(24, 3.5); // Forward fuselage right
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cockpit Windshield (Glossy deep obsidian #0A1026 from reference card)
        ctx.fillStyle = isLight ? '#0A1026' : '#295f75';
        ctx.beginPath();
        ctx.moveTo(22, -2.5);
        ctx.lineTo(16, -3.2);
        ctx.lineTo(16, 3.2);
        ctx.lineTo(22, 2.5);
        ctx.closePath();
        ctx.fill();

        // Vertical Tail Fin (Rudder)
        ctx.fillStyle = isLight ? '#94A3B8' : '#CBD5E1';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-28, 0);
        ctx.lineTo(-29, -14); // Tail top
        ctx.lineTo(-22, -14);
        ctx.closePath();
        ctx.fill();

        // 3) Blinking Aviation Navigation Beacons
        const beaconPhase = Math.floor(shuttle.beaconTimer) % 2;

        // Port Wingtip (Red Beacon)
        ctx.fillStyle = beaconPhase === 0 ? '#FF5C6C' : 'rgba(255, 92, 108, 0.3)';
        ctx.beginPath();
        ctx.arc(-14, -24, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Starboard Wingtip (Green Beacon)
        ctx.fillStyle = beaconPhase === 0 ? '#5EE0A8' : 'rgba(94, 224, 168, 0.3)';
        ctx.beginPath();
        ctx.arc(-14, 24, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Tail Fin Strobe (High Intensity White Flash)
        if (Math.sin(shuttle.beaconTimer * 4) > 0.85) {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(-29, -14, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Check if shuttle crossed screen
        if (shuttle.x > width + 140 || shuttle.y > height + 100) {
          shuttle.active = false;
          // Respawn after 8-16s
          setTimeout(resetShuttle, Math.random() * 8000 + 8000);
        }
      }

      // ── 5. Shooting Meteors with Trailing Ion Trails ───────
      const now = Date.now();
      if (now - lastMeteorTime > meteorInterval) {
        meteors.push(createMeteor());
        lastMeteorTime = now;
        meteorInterval = Math.random() * 3500 + 2000;
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life++;
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;

        const progress = m.life / m.maxLife;
        const currentOpacity = (1 - progress) * (progress < 0.15 ? progress / 0.15 : 1);

        const tailX = m.x - Math.cos(m.angle) * m.length;
        const tailY = m.y - Math.sin(m.angle) * m.length;

        ctx.save();
        const meteorGrad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        if (isLight) {
          meteorGrad.addColorStop(0, 'rgba(28, 79, 215, 0)');
          meteorGrad.addColorStop(0.4, `rgba(28, 79, 215, ${currentOpacity * 0.35})`);
          meteorGrad.addColorStop(0.8, `rgba(56, 189, 248, ${currentOpacity * 0.7})`);
          meteorGrad.addColorStop(1, `rgba(28, 79, 215, ${currentOpacity * 0.9})`);
        } else {
          meteorGrad.addColorStop(0, 'rgba(41, 95, 117, 0)');
          meteorGrad.addColorStop(0.4, `rgba(41, 95, 117, ${currentOpacity * 0.45})`);
          meteorGrad.addColorStop(0.8, `rgba(184, 213, 229, ${currentOpacity * 0.75})`);
          meteorGrad.addColorStop(1, `rgba(255, 255, 255, ${currentOpacity * 0.95})`);
        }

        ctx.strokeStyle = meteorGrad;
        ctx.lineWidth = m.thickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();

        // Glowing white core at head
        ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.thickness * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (m.life >= m.maxLife) {
          meteors.splice(i, 1);
        }
      }

      animId = requestAnimationFrame(animate);
    }

    animId = requestAnimationFrame(animate);

    function onVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        animId = requestAnimationFrame(animate);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="avia-space-canvas"
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  );
}
