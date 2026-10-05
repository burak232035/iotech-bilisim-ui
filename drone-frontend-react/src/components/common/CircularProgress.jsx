/**
 * CircularProgress Component
 * SVG circular progress indicator with color coding
 * Adapted from harita.js lines 258-287
 */

export function CircularProgress({
  value = 0,
  size = 120,
  strokeWidth = 10,
  label = '',
  colorThresholds = { low: 30, medium: 70 },
  color: colorOverride
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const getColor = () => {
    if (value < colorThresholds.low) return '#dc2626'; // red
    if (value < colorThresholds.medium) return '#f59e0b'; // amber
    return '#16a34a'; // green
  };

  const color = colorOverride || getColor();

  return (
    <svg width={size} height={size}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
        fill="none"
      />

      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{
          transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease'
        }}
      />

      {/* Percentage text */}
      <text
        x={size / 2}
        y={size / 2 + 8}
        textAnchor="middle"
        fontSize="20"
        fontWeight="bold"
        fill={color}
        style={{ transition: 'fill 0.3s ease' }}
      >
        {label || `%${Math.round(value)}`}
      </text>
    </svg>
  );
}
