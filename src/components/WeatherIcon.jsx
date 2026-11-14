// Hand-drawn SVG condition icons. Bundled (so they work offline, unlike the
// providers' remote PNGs) and identical for both weather sources. With
// `animated`, CSS keyframes in index.css bring them to life; reduced-motion
// users get the static version.
import { CONDITION_LABEL } from '../services/conditions.js'

const RAYS = Array.from({ length: 8 }, (_, i) => i * 45)

function Sun({ cx = 32, cy = 32, r = 10 }) {
  return (
    <g>
      <g className="wi-rays" stroke="var(--wi-sun)" strokeWidth="3" strokeLinecap="round">
        {RAYS.map((deg) => {
          const rad = (deg * Math.PI) / 180
          return (
            <line
              key={deg}
              x1={cx + Math.cos(rad) * (r + 5)}
              y1={cy + Math.sin(rad) * (r + 5)}
              x2={cx + Math.cos(rad) * (r + 9)}
              y2={cy + Math.sin(rad) * (r + 9)}
            />
          )
        })}
      </g>
      <circle cx={cx} cy={cy} r={r} fill="var(--wi-sun)" />
    </g>
  )
}

function Moon({ x = 0, y = 0, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path className="wi-moon" d="M38 12a20 20 0 1 0 14 34A16 16 0 0 1 38 12z" fill="var(--wi-moon)" />
    </g>
  )
}

function Cloud({ x = 0, y = 0, scale = 1, back = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={back ? 'wi-cloud-back' : 'wi-cloud'} fill={back ? 'var(--wi-cloud-back)' : 'var(--wi-cloud)'}>
        <circle cx="20" cy="38" r="8" />
        <circle cx="31" cy="31" r="12" />
        <circle cx="43" cy="36" r="10" />
        <rect x="20" y="36" width="23" height="10" />
      </g>
    </g>
  )
}

function Drops({ light = false }) {
  return (
    <g stroke="var(--wi-rain)" strokeWidth={light ? 2 : 2.6} strokeLinecap="round">
      {[24, 32, 40].map((x) => (
        <line key={x} className="wi-drop" x1={x} y1="46" x2={x - 2} y2={light ? 50 : 52} />
      ))}
    </g>
  )
}

function Flakes() {
  return (
    <g fill="var(--wi-snow)">
      {[24, 32, 40].map((x) => (
        <circle key={x} className="wi-flake" cx={x} cy="49" r="2.2" />
      ))}
    </g>
  )
}

function Fog() {
  return (
    <g stroke="var(--wi-cloud)" strokeWidth="3" strokeLinecap="round">
      <line className="wi-fog-line" x1="14" y1="50" x2="46" y2="50" />
      <line className="wi-fog-line" x1="20" y1="55" x2="52" y2="55" />
      <line className="wi-fog-line" x1="12" y1="60" x2="40" y2="60" />
    </g>
  )
}

function Shapes({ condition, isDay }) {
  switch (condition) {
    case 'clear':
      return isDay ? <Sun /> : <Moon x={-2} y={2} />
    case 'partly-cloudy':
      return (
        <>
          {isDay ? <Sun cx={24} cy={22} r={8} /> : <Moon x={-6} y={-4} scale={0.75} />}
          <Cloud x={6} y={6} scale={0.9} />
        </>
      )
    case 'cloudy':
      return (
        <>
          <Cloud x={12} y={-8} scale={0.75} back />
          <Cloud x={0} y={4} />
        </>
      )
    case 'fog':
      return (
        <>
          <Cloud x={0} y={-6} />
          <Fog />
        </>
      )
    case 'drizzle':
      return (
        <>
          <Cloud x={0} y={-8} />
          <Drops light />
        </>
      )
    case 'rain':
      return (
        <>
          <Cloud x={0} y={-8} />
          <Drops />
        </>
      )
    case 'snow':
      return (
        <>
          <Cloud x={0} y={-8} />
          <Flakes />
        </>
      )
    case 'thunder':
      return (
        <>
          <Cloud x={0} y={-10} />
          <polygon className="wi-bolt" points="32,38 25,50 31,50 27,61 39,45 33,45 37,38" fill="var(--wi-sun)" />
        </>
      )
    default:
      return <Cloud x={0} y={0} />
  }
}

export default function WeatherIcon({ condition, isDay = true, size = 40, animated = false, label, className = '' }) {
  const name = label ?? CONDITION_LABEL[condition] ?? 'Weather'
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={name}
      className={`shrink-0 overflow-visible ${animated ? 'wi-anim' : ''} ${className}`}
    >
      <Shapes condition={condition} isDay={isDay} />
    </svg>
  )
}
