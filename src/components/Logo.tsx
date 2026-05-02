export default function Logo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="19" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <line x1="9.88" y1="9.88" x2="6.41" y2="6.41" />
      <line x1="14.12" y1="14.12" x2="17.59" y2="17.59" />
      <line x1="14.12" y1="9.88" x2="17.59" y2="6.41" />
      <line x1="9.88" y1="14.12" x2="6.41" y2="17.59" />
    </svg>
  );
}
