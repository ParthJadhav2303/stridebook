import type { ReactNode } from "react";

/** Stadium-shaped path (two straights, two bends), starting at the finish line (bottom centre)
 *  and running anticlockwise like a real athletics track. */
function stadium(x: number, y: number, w: number, h: number) {
  const r = h / 2;
  const cx = x + w / 2;
  return [
    `M ${cx} ${y + h}`,
    `L ${x + w - r} ${y + h}`,
    `A ${r} ${r} 0 0 0 ${x + w - r} ${y}`,
    `L ${x + r} ${y}`,
    `A ${r} ${r} 0 0 0 ${x + r} ${y + h}`,
    `Z`,
  ].join(" ");
}

const W = 340;
const H = 196;
const C = { x: 22, y: 22, w: W - 44, h: H - 44 }; // centre line of the running surface
const lane = (o: number) => stadium(C.x - o, C.y - o, C.w + 2 * o, C.h + 2 * o);

/** The home screen's signature: fees collected drawn as a lap of the track. */
export function TrackOval({ percent, children }: { percent: number; children: ReactNode }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" aria-hidden="true">
        {/* running surface: track brick under floodlights */}
        <path d={lane(0)} fill="none" stroke="var(--color-brick)" strokeOpacity="0.55" strokeWidth="30" />
        {/* lane lines */}
        {[-15, -5, 5, 15].map((o) => (
          <path key={o} d={lane(o)} fill="none" stroke="#fff" strokeOpacity={Math.abs(o) === 15 ? 0.35 : 0.16} strokeWidth="1" />
        ))}
        {/* finish line */}
        <line x1={W / 2} x2={W / 2} y1={C.y + C.h - 15} y2={C.y + C.h + 15} stroke="#fff" strokeWidth="2.5" strokeOpacity="0.85" />
        {/* the lap: share of fees collected */}
        {p > 0 && (
          <path
            d={lane(0)}
            pathLength={100}
            fill="none"
            stroke="var(--color-volt)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${p} 100`}
            className="lap-draw"
            style={{ ["--lap-length" as string]: p, filter: "drop-shadow(0 0 6px rgb(198 244 50 / .55))" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center px-14">{children}</div>
    </div>
  );
}
