/**
 * Badge Component
 * Status badge with color variants
 */

export function Badge({ children, variant = 'secondary', className = '' }) {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {children}
    </span>
  );
}
