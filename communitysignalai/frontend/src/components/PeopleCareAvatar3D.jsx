import JarvisCore from "./JarvisCore.jsx";

/** Legacy 3D-avatar API retained as an alias for the shared PeopleCare guide. */
export default function PeopleCareAvatar3D({ state = "idle", size = 180, className = "", label, ...props }) {
  void props;
  return <JarvisCore state={state} size={size} compact={size < 90} className={className} label={label || "PeopleCare AI holographic core"} />;
}
