/**
 * AreaLegend Component
 * Area list with selection and delete
 * Adapted from harita.js lines 492-625
 */

import { useMap } from '@contexts/MapContext';
import { AREA_COLORS } from '@utils/constants';
import { escapeHtml } from '@utils/validation.utils';

export function AreaLegend() {
  const { drawOrder, selectArea, deleteArea, selectedAreaId } = useMap();

  const handleSelectArea = (areaId) => {
    selectArea(areaId);
  };

  const handleDeleteArea = async (e, areaId) => {
    e.stopPropagation(); // Prevent selection
    await deleteArea(areaId);
  };

  if (drawOrder.length === 0) {
    return (
      <div className="area-legend">
        <div className="area-legend__title">Alanlar</div>
        <div className="area-legend__empty text-center p-3">
          <i
            className="fas fa-draw-polygon mb-2"
            style={{ fontSize: '24px', color: '#9ca3af' }}
          ></i>
          <div style={{ fontWeight: 600, color: '#374151' }}>
            Henüz tanımlı alan yok
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Harita üzerinden yeni bir alan çizerek başlayabilirsin
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="area-legend">
      <div className="area-legend__title">Alanlar</div>
      <div id="legendItems">
        {drawOrder.map((item, idx) => {
          const dbId = String(item.dbId);
          const orderIndex = idx + 1;
          const color = AREA_COLORS[idx % AREA_COLORS.length];
          const displayName = `Alan ${orderIndex}: ${item.name}`;
          const isSelected = selectedAreaId === dbId;

          return (
            <div
              key={dbId}
              className={`area-legend__item ${
                isSelected ? 'area-legend__item--selected' : ''
              }`}
              data-select-area={dbId}
              title="Seçmek için tıkla"
              onClick={() => handleSelectArea(dbId)}
              style={{
                backgroundColor: isSelected ? '#f0f9ff' : 'transparent',
                cursor: 'pointer'
              }}
            >
              <span
                className="swatch"
                style={{ background: color }}
              ></span>
              <span className="label">{escapeHtml(displayName)}</span>
              <button
                className="legend-del"
                title="Sil"
                onClick={(e) => handleDeleteArea(e, dbId)}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
