/**
 * Card Component
 * AdminLTE card wrapper
 */

export function Card({ title, icon, variant = 'primary', children, className = '' }) {
  return (
    <div className={`card card-${variant} ${className}`}>
      {title && (
        <div className="card-header">
          <h3 className="card-title">
            {icon && <i className={icon}></i>} {title}
          </h3>
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}
