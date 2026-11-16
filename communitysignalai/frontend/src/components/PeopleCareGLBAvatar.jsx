import JarvisCore from "./JarvisCore.jsx";

/** Backward-compatible import; PeopleCare uses its shared hologram rather than a character model. */
export default function PeopleCareGLBAvatar({ state = "idle", size = 220, className = "", label, ...props }) {
  void props;
  return <JarvisCore state={state} size={size} compact={size < 90} className={className} label={label || "PeopleCare AI holographic core"} />;
}
