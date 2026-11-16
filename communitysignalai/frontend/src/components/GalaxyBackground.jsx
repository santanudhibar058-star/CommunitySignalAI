import "./GalaxyBackground.css";

const STARS = [
  [5, 14, 1.2, 0.4], [11, 42, 1, 1.9], [17, 72, 1.6, 2.7], [22, 25, 1, 1.2],
  [27, 56, 1.2, 3.4], [31, 12, 1.8, 0.8], [36, 84, 1, 2.1], [40, 38, 1.2, 4.3],
  [44, 65, 1.8, 1.6], [49, 18, 1, 3.7], [53, 49, 1.3, 0.5], [58, 77, 1, 2.9],
  [62, 29, 2, 1.1], [66, 58, 1.1, 4.8], [71, 11, 1.2, 2.4], [75, 47, 1.8, 0.2],
  [80, 70, 1, 3.2], [84, 23, 1.4, 1.5], [89, 54, 1, 4.1], [95, 34, 1.7, 2.2],
  [8, 87, 1, 3.5], [19, 9, 1.5, 4.6], [34, 29, 1, 2.5], [47, 91, 1.4, 0.9],
  [57, 7, 1, 3.9], [69, 88, 1.6, 1.7], [78, 91, 1, 4.5], [93, 81, 1.4, 0.7],
  [60, 34, 1, 2.6], [64, 39, 1.3, 0.3], [70, 32, 1, 3.6], [73, 41, 1.2, 1.3],
];

const SHOOTING_STARS = [
  { top: "19%", left: "72%", delay: "-8s", length: "118px" },
  { top: "61%", left: "34%", delay: "-19s", length: "86px" },
];

function GalaxyBackground({ activeView }) {
  const focusClass = activeView === "peoplecare"
    ? "galaxy-background__focus-glow is-assistant"
    : activeView === "signals"
      ? "galaxy-background__focus-glow is-signals"
      : null;

  return (
    <div className="galaxy-background" aria-hidden="true">
      <div className="galaxy-background__nebula galaxy-background__nebula--blue" />
      <div className="galaxy-background__nebula galaxy-background__nebula--violet" />
      {focusClass && <div className={focusClass} />}

      <div className="galaxy-background__stars">
        {STARS.map(([x, y, size, delay]) => (
          <i
            className={`galaxy-background__star${size > 1.5 ? " is-bright" : ""}`}
            key={`${x}-${y}`}
            style={{
              "--star-left": `${x}%`,
              "--star-top": `${y}%`,
              "--star-size": `${size}px`,
              "--star-delay": `${delay}s`,
            }}
          />
        ))}
      </div>

      {SHOOTING_STARS.map((star) => (
        <i
          className="galaxy-background__shooting-star"
          key={star.left}
          style={{
            "--shoot-top": star.top,
            "--shoot-left": star.left,
            "--shoot-delay": star.delay,
            "--shoot-length": star.length,
          }}
        />
      ))}
    </div>
  );
}

export default GalaxyBackground;
