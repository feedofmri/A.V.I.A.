import { useRef, useLayoutEffect, useState } from "react";

export type ViewId =
  | "overview"
  | "assistant"
  | "tools"
  | "twin"
  | "analytics"
  | "alerts"
  | "behavioral"
  | "setup";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "twin", label: "Digital twin" },
  { id: "analytics", label: "Analytics" },
  { id: "alerts", label: "Alerts" },
  { id: "behavioral", label: "Behavioral" },
  { id: "setup", label: "Mission setup" },
];

interface NavPillProps {
  active: ViewId;
  onChange: (v: ViewId) => void;
}

export function NavPill({ active, onChange }: NavPillProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    function update() {
      const idx = VIEWS.findIndex((v) => v.id === active);
      const btn = itemRefs.current[idx];
      if (btn && containerRef.current) {
        const containerLeft = containerRef.current.getBoundingClientRect().left;
        const btnRect = btn.getBoundingClientRect();
        setIndicator({
          left: btnRect.left - containerLeft,
          width: btnRect.width,
        });
        // On mobile view, gently center active button in scroll view
        btn.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active]);

  return (
    <div className="nav-pill" ref={containerRef}>
      <div
        className="nav-pill__indicator"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {VIEWS.map((v, i) => (
        <button
          key={v.id}
          id={`nav-${v.id}`}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className={`nav-pill__item${active === v.id ? " nav-pill__item--active" : ""}`}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
