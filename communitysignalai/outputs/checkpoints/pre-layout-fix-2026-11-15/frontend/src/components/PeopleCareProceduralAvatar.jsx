import JarvisCore from "./JarvisCore.jsx";

/** Legacy procedural-avatar path retained as a compatibility wrapper. */
export default function PeopleCareProceduralAvatar({ state = "idle", size = 220, className = "", label, ...props }) {
  void props;
  return <JarvisCore state={state} size={size} compact={size < 90} className={className} label={label || "PeopleCare AI JARVIS interface"} />;
}