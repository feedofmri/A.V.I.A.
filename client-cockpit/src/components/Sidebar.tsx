import { Fragment, useState, useRef, useEffect } from "react";
import { useCockpitData } from "../api/CockpitData";
import type { CrewMember } from "../api/bff";
import { StatusDot } from "./StatusPill";
import { Logo } from "./Logo";
import type { ViewId } from "./NavPill";

export interface SidebarProps {
  activeCrew: string;
  onCrewSelect: (id: string) => void;
  activeView: ViewId;
  onViewChange: (v: ViewId) => void;
  isOpen?: boolean;
  onClose?: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  onPulseClick?: () => void;
}

const NAV_ITEMS: {
  id: ViewId;
  label: string;
  icon: JSX.Element;
  badge?: number;
}[] = [
  {
    id: "overview",
    label: "Overview",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
        <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
        <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
        <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
      </svg>
    ),
  },
  {
    id: "assistant",
    label: "Health assistant",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" />
      </svg>
    ),
  },
  {
    id: "tools",
    label: "Mission tools",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="4" y="6" width="16" height="15" rx="3" />
        <path d="M8 6V3h8v3M8 12h8M12 9v6" />
      </svg>
    ),
  },
  {
    id: "twin",
    label: "Digital Twin",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="7" r="4"></circle>
        <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"></path>
      </svg>
    ),
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
    ),
  },
  {
    id: "alerts",
    label: "Alerts",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
    ),
  },
  {
    id: "behavioral",
    label: "Behavioral",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
    ),
  },
  {
    id: "setup",
    label: "Mission setup",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="4" y1="21" x2="4" y2="14"></line>
        <line x1="4" y1="10" x2="4" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12" y2="3"></line>
        <line x1="20" y1="21" x2="20" y2="16"></line>
        <line x1="20" y1="12" x2="20" y2="3"></line>
        <line x1="1" y1="14" x2="7" y2="14"></line>
        <line x1="9" y1="8" x2="15" y2="8"></line>
        <line x1="17" y1="16" x2="23" y2="16"></line>
      </svg>
    ),
  },
];

export function Sidebar({
  activeCrew,
  onCrewSelect,
  activeView,
  onViewChange,
  isOpen = false,
  onClose,
  theme = "dark",
  onToggleTheme,
  onPulseClick,
}: SidebarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { crew, alerts, mission } = useCockpitData();
  const selectedCrew: Pick<
    CrewMember,
    "initials" | "name" | "role" | "status"
  > = crew.find((c) => c.id === activeCrew) ??
    crew[0] ?? {
      initials: "··",
      name: "Loading crew…",
      role: "",
      status: "unknown",
    };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  function handleSelectCrew(id: string) {
    onCrewSelect(id);
    setDropdownOpen(false);
  }

  function handleNavClick(viewId: ViewId) {
    onViewChange(viewId);
    if (onClose) {
      onClose();
    }
  }

  return (
    <aside
      className={`sidebar${isOpen ? " sidebar--open" : ""}`}
      aria-label="Sidebar navigation"
    >
      {/* ── Sidebar Brand Header: Logo + Dark/Light Mode Icon + Pulse Icon ── */}
      <div className="sidebar__brand-header">
        <div className="sidebar__brand">
          <Logo />
        </div>

        <div className="sidebar__brand-actions">
          {/* Round Dark/Light Mode Icon Button */}
          {onToggleTheme && (
            <button
              id="theme-toggle-btn"
              className="theme-toggle-btn"
              onClick={onToggleTheme}
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              type="button"
              style={{
                width: 36,
                height: 36,
                minWidth: 36,
                minHeight: 36,
                maxWidth: 36,
                maxHeight: 36,
                padding: 0,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
              }}
            >
              {theme === "dark" ? (
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              ) : (
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </button>
          )}

          {/* Round Pulse Icon Button */}
          {onPulseClick && (
            <button
              id="pulse-btn"
              className="pulse-btn"
              onClick={onPulseClick}
              aria-label="Open Pulse vitals entry"
              title="Open Pulse vitals entry"
              type="button"
              style={{
                width: 36,
                height: 36,
                minWidth: 36,
                minHeight: 36,
                maxWidth: 36,
                maxHeight: 36,
                padding: 0,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </button>
          )}

          {/* Mobile Drawer Close Button */}
          {onClose && (
            <button
              className="sidebar__close-btn"
              onClick={onClose}
              aria-label="Close navigation"
              title="Close navigation"
              type="button"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Crew Members Dropdown Selector */}
      <div className="sidebar__crew-section" ref={dropdownRef}>
        <div className="sidebar__section-label">Crew Member</div>

        <button
          id="crew-dropdown-btn"
          className={`crew-dropdown-btn${dropdownOpen ? " crew-dropdown-btn--open" : ""}`}
          onClick={() => setDropdownOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          aria-label={`Select crew member, currently ${selectedCrew.name}`}
          type="button"
        >
          <div className="crew-dropdown-btn__avatar">
            {selectedCrew.initials}
          </div>
          <div className="crew-dropdown-btn__info">
            <div className="crew-dropdown-btn__name">{selectedCrew.name}</div>
            <div className="crew-dropdown-btn__role">{selectedCrew.role}</div>
          </div>
          <div className="crew-dropdown-btn__meta">
            <StatusDot status={selectedCrew.status} />
            <svg
              className={`crew-dropdown-btn__chevron${dropdownOpen ? " crew-dropdown-btn__chevron--rotated" : ""}`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </button>

        {dropdownOpen && (
          <div
            className="crew-dropdown-menu"
            role="listbox"
            aria-label="Crew members list"
          >
            {crew.map((member) => {
              const isSelected = activeCrew === member.id;
              return (
                <button
                  key={member.id}
                  id={`crew-tab-${member.id}`}
                  className={`crew-dropdown-item${isSelected ? " crew-dropdown-item--active" : ""}`}
                  onClick={() => handleSelectCrew(member.id)}
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                >
                  <div
                    className="crew-dropdown-item__avatar"
                    style={
                      isSelected
                        ? {
                            background:
                              "var(--crew-active-avatar-bg, rgba(191,211,242,0.18))",
                            borderColor: "var(--accent-ice)",
                          }
                        : undefined
                    }
                  >
                    {member.initials}
                  </div>
                  <div className="crew-dropdown-item__info">
                    <div className="crew-dropdown-item__name">
                      {member.name}
                    </div>
                    <div className="crew-dropdown-item__role">
                      {member.role}
                    </div>
                  </div>
                  <div className="crew-dropdown-item__status">
                    <StatusDot status={member.status} />
                    <span className="crew-dropdown-item__sub">
                      {member.openAlerts > 0
                        ? `${member.openAlerts} open`
                        : "clear"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Side Navigation Panel */}
      <div className="sidebar__nav-section">
        <div className="sidebar__section-label">Navigation</div>
        <nav
          className="side-nav-list"
          role="navigation"
          aria-label="Main Navigation"
        >
          {(
            [
              {
                label: "Monitoring",
                items: ["overview", "alerts", "analytics", "twin"],
              },
              { label: "Health support", items: ["assistant", "behavioral"] },
              { label: "Mission", items: ["tools", "setup"] },
            ] as const
          ).map((group) => (
            <Fragment key={group.label}>
              <div className="side-nav-group-label">{group.label}</div>
              {group.items.map((id) => {
                const item = NAV_ITEMS.find((item) => item.id === id)!;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    id={`side-nav-${item.id}`}
                    className={`side-nav-btn${isActive ? " side-nav-btn--active" : ""}`}
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    type="button"
                  >
                    <span className="side-nav-btn__icon">{item.icon}</span>
                    <span className="side-nav-btn__label">{item.label}</span>
                    {(item.id === "alerts"
                      ? alerts.length
                      : (item.badge ?? 0)) > 0 && (
                      <span className="side-nav-btn__badge">
                        {item.id === "alerts" ? alerts.length : item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </nav>
      </div>

      {/* Sidebar Footer with Mission Status & Active Astronaut */}
      <div className="sidebar__footer">
        <div className="sidebar__footer-meta">
          <span className="sidebar__footer-badge">MISSION ACTIVE</span>
          <span className="sidebar__footer-sol">
            SOL {mission?.mission_day ?? "—"} ·{" "}
            {mission?.name ?? "Not configured"}
          </span>
          <span className="sidebar__footer-viewing">
            Viewing: {selectedCrew.name}
          </span>
        </div>
      </div>
    </aside>
  );
}
