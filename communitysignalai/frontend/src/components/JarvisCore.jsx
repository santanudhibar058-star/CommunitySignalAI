import { useId } from "react";
import "./JarvisCore.css";

const VALID_STATES = new Set(["idle", "ready", "listening", "thinking", "speaking", "success", "greeting", "responding", "error"]);
const PARTICLES = [
  [28, 77, 1.8], [43, 43, 1.4], [73, 23, 1.7], [164, 32, 1.3], [207, 74, 1.9],
  [215, 130, 1.4], [196, 184, 1.7], [151, 212, 1.2], [78, 206, 1.8], [36, 162, 1.3],
  [58, 120, 1.1], [181, 104, 1.2], [176, 162, 1.5], [97, 31, 1.1], [118, 18, 1.3],
  [22, 111, 1.2], [220, 105, 1.1], [132, 218, 1.3], [89, 190, 1.1], [205, 51, 1.1],
];

const STATE_LABELS = {
  idle: "READY",
  ready: "READY",
  listening: "LISTENING",
  thinking: "PROCESSING",
  speaking: "RESPONDING",
  success: "RESPONSE READY",
  greeting: "RESPONSE READY",
  responding: "RESPONSE READY",
  error: "NEEDS ATTENTION",
};

function polarPoint(radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return { x: 120 + Math.cos(radians) * radius, y: 120 + Math.sin(radians) * radius };
}

export default function JarvisCore({ state = "idle", size = 240, compact = false, className = "", label = "PeopleCare AI holographic assistant" }) {
  const gradientId = useId().replaceAll(":", "");
  const stateValue = VALID_STATES.has(state) ? state : "idle";
  const visualState = stateValue === "ready" ? "idle" : stateValue === "greeting" || stateValue === "responding" ? "success" : stateValue;
  const ticks = Array.from({ length: 72 }, (_, index) => {
    const angle = index * 5 - 90;
    const major = index % 6 === 0;
    const inner = polarPoint(major ? 105 : 108, angle);
    const outer = polarPoint(116, angle);
    return { key: index, inner, outer, major };
  });

  return (
    <div
      className={`jarvis-core ${compact || size < 90 ? "jarvis-core-compact" : ""} ${className}`.trim()}
      data-state={visualState}
      style={{ "--jarvis-size": `${size}px` }}
      role="img"
      aria-label={`${label}: ${STATE_LABELS[stateValue] || STATE_LABELS.idle}`}
      title={`${label} · ${STATE_LABELS[stateValue] || STATE_LABELS.idle}`}
    >
      <div className="jarvis-halo jarvis-halo-back" aria-hidden="true" />
      <div className="jarvis-halo jarvis-halo-front" aria-hidden="true" />
      <svg className="jarvis-hud" viewBox="0 0 240 240" aria-hidden="true">
        <defs>
          <radialGradient id={`${gradientId}-core`} cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#f7ffff" />
            <stop offset="16%" stopColor="#c4fbff" />
            <stop offset="36%" stopColor="#50dfff" />
            <stop offset="64%" stopColor="#477ef5" />
            <stop offset="86%" stopColor="#8060e9" />
            <stop offset="100%" stopColor="#10234d" />
          </radialGradient>
          <radialGradient id={`${gradientId}-aura`}>
            <stop offset="0%" stopColor="#80f8ff" stopOpacity=".34" />
            <stop offset="42%" stopColor="#6b6bff" stopOpacity=".2" />
            <stop offset="72%" stopColor="#de66ff" stopOpacity=".1" />
            <stop offset="100%" stopColor="#23d9ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${gradientId}-spectrum`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60f7ff" />
            <stop offset="26%" stopColor="#618bff" />
            <stop offset="51%" stopColor="#c47bff" />
            <stop offset="75%" stopColor="#ff83cf" />
            <stop offset="100%" stopColor="#6cf5d2" />
          </linearGradient>
          <filter id={`${gradientId}-glow`} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`${gradientId}-soft-glow`} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <circle className="jarvis-core-aura" cx="120" cy="120" r="70" fill={`url(#${gradientId}-aura)`} />
        <circle className="jarvis-aura-blur" cx="120" cy="120" r="61" fill={`url(#${gradientId}-aura)`} filter={`url(#${gradientId}-soft-glow)`} />

        <g className="jarvis-ring jarvis-ring-outer">
          <circle className="jarvis-track" cx="120" cy="120" r="115" />
          <circle className="jarvis-arc arc-long" cx="120" cy="120" r="115" stroke={`url(#${gradientId}-spectrum)`} />
          <circle className="jarvis-arc arc-short" cx="120" cy="120" r="115" stroke={`url(#${gradientId}-spectrum)`} />
          {ticks.map(({ key, inner, outer, major }) => (
            <line key={key} className={`jarvis-tick${major ? " major" : ""}`} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />
          ))}
          <circle className="jarvis-node" cx="120" cy="5" r="2.4" />
          <circle className="jarvis-node node-violet" cx="235" cy="120" r="2" />
        </g>

        <g className="jarvis-ring jarvis-ring-middle">
          <circle className="jarvis-track" cx="120" cy="120" r="94" />
          <circle className="jarvis-arc arc-middle" cx="120" cy="120" r="94" stroke={`url(#${gradientId}-spectrum)`} />
          <path className="jarvis-crosshair" d="M120 17v20m0 166v20M17 120h20m166 0h20" />
          <path className="jarvis-crosshair crosshair-diagonal" d="m47 47 12 12m122 122 12 12m0-146-12 12M59 181l-12 12" />
        </g>

        <g className="jarvis-ring jarvis-ring-inner">
          <circle className="jarvis-track" cx="120" cy="120" r="73" />
          <circle className="jarvis-arc arc-inner" cx="120" cy="120" r="73" stroke={`url(#${gradientId}-spectrum)`} />
          <circle className="jarvis-arc arc-inner arc-inner-reverse" cx="120" cy="120" r="62" stroke={`url(#${gradientId}-spectrum)`} />
        </g>

        <circle className="jarvis-core-shell" cx="120" cy="120" r="44" />
        <circle className="jarvis-core-light" cx="120" cy="120" r="36" fill={`url(#${gradientId}-core)`} filter={`url(#${gradientId}-glow)`} />
        <circle className="jarvis-core-inner" cx="120" cy="120" r="27" />
        <path className="jarvis-core-glyph" d="m120 99 18 10v22l-18 10-18-10v-22z" />
        <path className="jarvis-core-lines" d="m111 120 6 6 13-14m-10-12v5m0 30v5m-21-20h5m32 0h5" />
        <circle className="jarvis-core-point" cx="120" cy="120" r="2.2" />

        {PARTICLES.map(([x, y, radius], index) => (
          <circle
            key={`${x}-${y}`}
            className={`jarvis-particle${index % 4 === 0 ? " particle-violet" : ""}`}
            cx={x}
            cy={y}
            r={radius}
            style={{ "--particle-delay": `${(index % 7) * -0.37}s` }}
          />
        ))}
      </svg>

      <div className="jarvis-orbit orbit-a" aria-hidden="true"><i /></div>
      <div className="jarvis-orbit orbit-b" aria-hidden="true"><i /></div>
      <div className="jarvis-orbit orbit-c" aria-hidden="true"><i /></div>
      <div className="jarvis-energy-wave" aria-hidden="true" />
      {!compact && size >= 90 && (
        <div className="jarvis-readout" aria-hidden="true">
          <strong>PEOPLECARE AI</strong>
          <span>COMMUNITY INTELLIGENCE CORE</span>
        </div>
      )}
    </div>
  );
}
