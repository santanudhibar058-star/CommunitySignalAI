import JarvisCore from "./JarvisCore.jsx";

/** Legacy import resolves to the shared procedural PeopleCare guide. */
export default function ProceduralMaleAvatar({ state = "idle", size = 240, className = "", label, ...props }) {
  void props;
  return <JarvisCore state={state} size={size} className={className} label={label || "PeopleCare AI holographic core"} />;
}
