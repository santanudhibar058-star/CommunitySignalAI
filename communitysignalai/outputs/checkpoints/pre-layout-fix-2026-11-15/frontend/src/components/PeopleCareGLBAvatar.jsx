import JarvisCore from "./JarvisCore.jsx";

/** Backward-compatible model import. The character model was replaced by the shared JARVIS interface. */
export default function PeopleCareGLBAvatar({ state = "idle", size = 220, className = "", label, ...props }) {
  void props;
  return <JarvisCore state={state} size={size} compact={size < 90} className={className} label={label || "PeopleCare AI JARVIS interface"} />;
}