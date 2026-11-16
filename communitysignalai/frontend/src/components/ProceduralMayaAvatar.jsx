import JarvisCore from "./JarvisCore.jsx";

/** Legacy avatar import now renders the shared procedural PeopleCare guide. */
export default function ProceduralMayaAvatar({ state = "idle", size = 240, className = "", label, ...props }) {
  void props;
  return <JarvisCore state={state} size={size} className={className} label={label || "PeopleCare AI holographic core"} />;
}
