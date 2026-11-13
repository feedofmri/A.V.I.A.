/** A.V.I.A. logo — circle crossed by thin orbit line + wordmark */
export function Logo() {
  return (
    <div className="topbar__logo">
      <svg
        className="topbar__logo-mark"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="A.V.I.A. logo mark"
      >
        {/* Outer ring */}
        <circle cx="16" cy="16" r="14" stroke="#BFD3F2" strokeWidth="1" opacity="0.7" />
        {/* Inner dot */}
        <circle cx="16" cy="16" r="2" fill="#BFD3F2" />
        {/* Orbit ellipse */}
        <ellipse
          cx="16" cy="16"
          rx="14" ry="5.5"
          stroke="#BFD3F2"
          strokeWidth="0.8"
          opacity="0.45"
          transform="rotate(-22, 16, 16)"
        />
        {/* Orbit dot */}
        <circle
          cx="26.5" cy="13.2"
          r="1.5"
          fill="#BFD3F2"
          opacity="0.9"
          transform="rotate(-22, 16, 16)"
        />
      </svg>
      <span className="topbar__wordmark">A.V.I.A.</span>
    </div>
  );
}
