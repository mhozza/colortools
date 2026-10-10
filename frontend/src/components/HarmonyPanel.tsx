import React from 'react';
import { HarmonyEvaluationResult, SpokeDirective } from '../types';
import { Award, ArrowRight, Download, Sliders, CheckCircle2 } from 'lucide-react';

export interface HarmonyPanelProps {
  harmonies: HarmonyEvaluationResult[];
  selectedHarmonyName?: string | null;
  onSelectHarmony?: (harmony: HarmonyEvaluationResult) => void;
  onExportXmp?: () => void;
  isExporting?: boolean;
  exportSuccessMessage?: string | null;
  photoPath?: string | null;
  keyHueOverride?: number | null;
  onKeyHueChange?: (hue: number | null) => void;
}

export const HarmonyPanel: React.FC<HarmonyPanelProps> = ({
  harmonies,
  selectedHarmonyName,
  onSelectHarmony,
  onExportXmp,
  isExporting = false,
  exportSuccessMessage,
  photoPath,
  keyHueOverride = null,
  onKeyHueChange,
}) => {
  const activeHarmony =
    harmonies.find((h) => h.harmony_name === selectedHarmonyName) ||
    harmonies[0] ||
    null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        width: '100%',
        maxWidth: '420px',
        backgroundColor: '#0f172a',
        borderRadius: '8px',
        padding: '1rem',
        border: '1px solid #1e293b',
        color: '#f8fafc',
      }}
      data-testid="harmony-panel"
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
          Color Harmonies
        </h2>
        {activeHarmony && (
          <span
            style={{
              fontSize: '11px',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              padding: '2px 8px',
              borderRadius: '12px',
              border: '1px solid #334155',
            }}
          >
            {harmonies.length} Analyzed
          </span>
        )}
      </div>

      {/* Key Hue Override Slider */}
      {onKeyHueChange && (
        <div
          style={{
            backgroundColor: '#1e293b',
            borderRadius: '6px',
            padding: '0.6rem 0.75rem',
            border: '1px solid #334155',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sliders size={13} />
              Key Hue Override
            </span>
            <button
              onClick={() =>
                onKeyHueChange(
                  keyHueOverride !== null ? null : Math.round(activeHarmony?.spoke_angles[0] ?? 0)
                )
              }
              data-testid="toggle-auto-key-hue"
              style={{
                fontSize: '11px',
                background: 'none',
                border: 'none',
                color: keyHueOverride !== null ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {keyHueOverride !== null ? 'Reset Auto' : 'Auto (click to set)'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="range"
              min={0}
              max={359}
              value={keyHueOverride ?? Math.round(activeHarmony?.spoke_angles[0] ?? 0)}
              onChange={(e) => onKeyHueChange(Number(e.target.value))}
              data-testid="key-hue-slider"
              style={{ flex: 1, accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', minWidth: '38px', textAlign: 'right', fontWeight: 500 }}>
              {keyHueOverride !== null ? `${keyHueOverride}°` : 'Auto'}
            </span>
          </div>
        </div>
      )}

      {/* Ranked Harmony Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {harmonies.length === 0 ? (
          <div
            style={{
              padding: '1.5rem',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '13px',
              backgroundColor: '#1e293b',
              borderRadius: '6px',
              border: '1px dashed #334155',
            }}
          >
            Sample at least 2 points on the photo to calculate photographic color harmonies.
          </div>
        ) : (
          harmonies.map((harmony, idx) => {
            const isSelected = activeHarmony?.harmony_name === harmony.harmony_name;
            const isTop = idx === 0;
            const score = harmony.match_score;

            // Score color styling
            let barColor = '#64748b';
            if (score >= 80) barColor = '#10b981'; // Green
            else if (score >= 60) barColor = '#f59e0b'; // Amber
            else if (score >= 40) barColor = '#3b82f6'; // Blue

            return (
              <div
                key={harmony.harmony_name}
                onClick={() => onSelectHarmony?.(harmony)}
                data-testid={`harmony-card-${harmony.harmony_name}`}
                style={{
                  backgroundColor: isSelected ? '#1e293b' : 'rgba(30, 41, 59, 0.45)',
                  border: isSelected ? '1px solid #38bdf8' : '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.6rem 0.8rem',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                      {harmony.harmony_name}
                    </span>
                    {isTop && (
                      <span
                        style={{
                          fontSize: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          backgroundColor: 'rgba(245, 158, 11, 0.2)',
                          color: '#fbbf24',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        <Award size={10} /> Top Match
                      </span>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: barColor }}>
                    {score.toFixed(1)}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '5px',
                    backgroundColor: '#0f172a',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    marginTop: '6px',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(Math.max(score, 0), 100)}%`,
                      height: '100%',
                      backgroundColor: barColor,
                      borderRadius: '3px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Selected Harmony Directives Section */}
      {activeHarmony && (
        <div
          style={{
            backgroundColor: '#1e293b',
            borderRadius: '6px',
            padding: '0.8rem',
            border: '1px solid #334155',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#94a3b8',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Adjustment Directives ({activeHarmony.harmony_name})
          </div>

          {activeHarmony.directives.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
              Samples match this harmony configuration perfectly (no shifts required).
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeHarmony.directives.map((dir: SpokeDirective, i: number) => {
                const isPositive = dir.delta_degrees >= 0;
                return (
                  <div
                    key={`${dir.sample_id}-${i}`}
                    data-testid={`spoke-directive-${dir.sample_id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      backgroundColor: 'rgba(15, 23, 42, 0.6)',
                      padding: '5px 8px',
                      borderRadius: '4px',
                      border: '1px solid #334155',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{dir.sample_name}</span>
                      <ArrowRight size={11} style={{ color: '#64748b' }} />
                      <span
                        style={{
                          color: '#fbbf24',
                          fontWeight: 500,
                          backgroundColor: 'rgba(245, 158, 11, 0.1)',
                          padding: '1px 5px',
                          borderRadius: '3px',
                        }}
                      >
                        {dir.target_color_name}
                      </span>
                    </div>

                    <div style={{ fontWeight: 600, color: isPositive ? '#38bdf8' : '#f43f5e' }}>
                      {isPositive ? `+${dir.delta_degrees.toFixed(1)}°` : `${dir.delta_degrees.toFixed(1)}°`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Export XMP Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        {exportSuccessMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #10b981',
              borderRadius: '6px',
              padding: '6px 10px',
              color: '#34d399',
              fontSize: '11px',
            }}
            data-testid="export-success-msg"
          >
            <CheckCircle2 size={14} />
            <span>{exportSuccessMessage}</span>
          </div>
        )}

        <button
          onClick={onExportXmp}
          disabled={isExporting || !photoPath}
          data-testid="export-xmp-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: !photoPath ? '#334155' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 14px',
            cursor: !photoPath || isExporting ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '12px',
            transition: 'background-color 0.2s',
          }}
        >
          <Download size={14} />
          <span>{isExporting ? 'Exporting sidecar...' : 'Export Lightroom Classic XMP'}</span>
        </button>
      </div>
    </div>
  );
};

export default HarmonyPanel;
