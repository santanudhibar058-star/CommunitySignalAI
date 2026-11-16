import { useId } from "react";
import "./JarvisCore.css";

const STATE_LABELS = {
  idle: "SYSTEM READY",
  ready: "SYSTEM READY",
  listening: "LISTENING",
  thinking: "PROCESSING",
  speaking: "SPEAKING",
  greeting: "RESPONSE READY",
  success: "RESPONSE READY",
  responding: "RESPONSE READY",
  error: "CONNECTION ISSUE",
};

function normalizeState(state) {
  return Object.hasOwn(STATE_LABELS, state) ? (state === "ready" ? "idle" : state === "responding" || state === "greeting" ? "success" : state) : "idle";
}

const particles = Array.from({ length: 28 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 28;
  const radius = index % 4 === 0 ? 139 : 126 + (index % 3) * 4;
  return {
    x: 160 + Math.cos(angle) * radius,
    y: 160 + Math.sin(angle) * radius,
    delay: `${-(index % 11) * 0.23}s`,
    size: index % 6 === 0 ? 2.2 : 1.3,
  };
});

/** Lightweight shared holographic AI core. Its state is supplied by real chat/voice events. */
export default function JarvisCore({ state = "idle", size = 240, compact = false, className = "", label = "PeopleCare AI holographic assistant" }) {
  const id = useId().replaceAll(":", "");
  const visualState = normalizeState(state);
  const readableState = STATE_LABELS[visualState] || STATE_LABELS.idle;

  return (
    <div
      className={`jarvis-core ${compact ? "jarvis-core-compact" : ""} ${className}`.trim()}
      data-state={visualState}
      style={{ "--jarvis-size": `${size}px`, "--jarvis-arc-paint": `url(#${id}-arcLight)` }}
      role="img"
      aria-label={`${label}: ${readableState.toLowerCase()}`}
      title={`JARVIS interface · ${readableState.toLowerCase()}`}
    >
      <div className="jarvis-halo jarvis-halo-back" aria-hidden="true" />
      <svg className="jarvis-hud" viewBox="0 0 320 320" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-coreLight`}>
            <stop offset="0" stopColor="#e9ffff" />
            <stop offset="0.2" stopColor="#8bf6ff" />
            <stop offset="0.48" stopColor="#22c5ee" />
            <stop offset="0.76" stopColor="#1273c5" />
            <stop offset="1" stopColor="#08182c" />
          </radialGradient>
          <linearGradient id={`${id}-arcLight`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#dafdff" />
            <stop offset="0.48" stopColor="#38d7fa" />
            <stop offset="1" stopColor="#755dff" />
          </linearGradient>
          <filter id={`${id}-softGlow`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g className="jarvis-ring jarvis-ring-outer">
          <circle cx="160" cy="160" r="146" className="jarvis-track" />
          <circle cx="160" cy="160" r="146" className="jarvis-arc arc-long" />
          <circle cx="160" cy="160" r="146" className="jarvis-arc arc-short" />
          {Array.from({ length: 48 }, (_, index) => (
            <path key={`tick-${index}`} d="M160 8v7" transform={`rotate(${index * 7.5} 160 160)`} className={index % 4 === 0 ? "jarvis-tick major" : "jarvis-tick"} />
          ))}
        </g>

        <g className="jarvis-ring jarvis-ring-middle">
          <circle cx="160" cy="160" r="118" className="jarvis-track" />
          <circle cx="160" cy="160" r="118" className="jarvis-arc arc-middle" />
          <circle cx="160" cy="42" r="3.5" className="jarvis-node" />
          <circle cx="160" cy="278" r="2.5" className="jarvis-node node-violet" />
        </g>

        <g className="jarvis-ring jarvis-ring-inner">
          <circle cx="160" cy="160" r="89" className="jarvis-track" />
          <path d="M160 71 A89 89 0 0 1 249 160" className="jarvis-arc arc-inner" />
          <path d="M160 249 A89 89 0 0 1 71 160" className="jarvis-arc arc-inner arc-inner-reverse" />
          <path d="M160 86v19M160 215v19M86 160h19M215 160h19" className="jarvis-crosshair" />
        </g>

        <g className="jarvis-particles">
          {particles.map((particle, index) => (
            <circle key={`particle-${index}`} cx={particle.x} cy={particle.y} r={particle.size} style={{ "--particle-delay": particle.delay }} className={index % 5 === 0 ? "jarvis-particle particle-violet" : "jarvis-particle"} />
          ))}
        </g>

        <circle cx="160" cy="160" r="64" className="jarvis-core-aura" filter={`url(#${id}-softGlow)`} />
        <circle cx="160" cy="160" r="49" className="jarvis-core-shell" />
        <circle cx="160" cy="160" r="40" fill={`url(#${id}-coreLight)`} className="jarvis-core-light" />
        <circle cx="160" cy="160" r="27" className="jarvis-core-inner" />
        <path d="M160 139l17 9.5v19L160 177l-17-9.5v-19z" className="jarvis-core-glyph" />
        <path d="M160 146v28M148 153l24 14M172 153l-24 14" className="jarvis-core-lines" />
        <circle cx="160" cy="160" r="3" className="jarvis-core-point" />
      </svg>

      <div className="jarvis-orbit orbit-a" aria-hidden="true"><i /></div>
      <div className="jarvis-orbit orbit-b" aria-hidden="true"><i /></div>
      <div className="jarvis-energy-wave" aria-hidden="true" />
      {!compact && (
        <div className="jarvis-readout" aria-hidden="true">
          <span>PEOPLECARE <b>AI</b></span>
          <strong>{readableState}</strong>
        </div>
      )}
    </div>
  );
}
