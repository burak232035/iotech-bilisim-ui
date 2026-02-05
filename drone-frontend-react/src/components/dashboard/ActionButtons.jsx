/**
 * ActionButtons Component
 * 4 demo action buttons
 * Adapted from harita.js lines 984-987
 */

export function ActionButtons() {
  const handleExploration = () => {
    alert('Alan keşfi başlatıldı (demo).');
  };

  const handleScan = () => {
    alert('Alan tarama başlatıldı (demo).');
  };

  const handleReturnToStation = () => {
    alert('Drone istasyona çağrıldı (demo).');
  };

  const handleManualControl = () => {
    alert('Elle kontrol modu açıldı (demo).');
  };

  return (
    <div className="row mt-2">
      <div className="col-md-3 mb-3">
        <button
          type="button"
          className="card action-card bg-primary"
          onClick={handleExploration}
          style={{ width: '100%' }}
        >
          <div className="card-body action-card-body">
            <i className="fas fa-route"></i>
            <span>Alan Keşfi</span>
          </div>
        </button>
      </div>

      <div className="col-md-3 mb-3">
        <button
          type="button"
          className="card action-card bg-info"
          onClick={handleScan}
          style={{ width: '100%' }}
        >
          <div className="card-body action-card-body">
            <i className="fas fa-search"></i>
            <span>Alan Tarama</span>
          </div>
        </button>
      </div>

      <div className="col-md-3 mb-3">
        <button
          type="button"
          className="card action-card bg-warning"
          onClick={handleReturnToStation}
          style={{ width: '100%' }}
        >
          <div className="card-body action-card-body">
            <i className="fas fa-home"></i>
            <span>İstasyona Dön</span>
          </div>
        </button>
      </div>

      <div className="col-md-3 mb-3">
        <button
          type="button"
          className="card action-card bg-danger"
          onClick={handleManualControl}
          style={{ width: '100%' }}
        >
          <div className="card-body action-card-body">
            <i className="fas fa-gamepad"></i>
            <span>Elle Kontrol</span>
          </div>
        </button>
      </div>
    </div>
  );
}
