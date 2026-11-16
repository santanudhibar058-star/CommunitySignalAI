import JarvisCore from "./JarvisCore.jsx";

/** Legacy male-avatar import now resolves to the shared JARVIS holographic core. */
export default function ProceduralMaleAvatar({ state = "idle", size = 240, className = "", label, ...props }) {
  void props;
  return <JarvisCore state={state} size={size} className={className} label={label || "PeopleCare AI JARVIS interface"} />;
}