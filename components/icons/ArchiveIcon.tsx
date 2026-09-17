export function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 15 15"
      fill="none"
      className={className}
    >
      {/* Lid - U shape at top */}
      <path
        d="M 1 1 L 14 1 L 14 4.5 L 1 4.5 L 1 1 Z"
        stroke="currentColor"
        strokeWidth="1"
      />
      {/* Box body */}
      <path
        d="M 2 4.5 L 2 14 L 13 14 L 13 4.5"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      {/* Inner line for drawer handle */}
      <line
        x1="5"
        y1="7.5"
        x2="10"
        y2="7.5"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}
