/**
 * Engine Selector Component
 * 
 * Displays available engines and allows selection.
 */

'use client';

import { type Engine } from '@/lib/engine/types';
import { CAPABILITY_ABBREVIATIONS } from '@/lib/engine/protocol';
import styles from './EngineSelector.module.css';

export interface EngineSelectorProps {
  /** Available engines */
  engines: Map<string, Engine>;
  /** Currently selected engine */
  currentEngine: Engine | null;
  /** Selection handler */
  onSelect: (id: string) => void;
  /** Custom engine load handler */
  onLoadCustom: () => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Engine Selector Component
 */
export function EngineSelector({
  engines,
  currentEngine,
  onSelect,
  onLoadCustom,
  isLoading = false,
}: EngineSelectorProps) {
  const engineList = Array.from(engines.values());
  const presetEngines = engineList.filter((e) => e.isPreset);
  const customEngines = engineList.filter((e) => !e.isPreset);
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Engines</h3>
        <button
          className={styles.customBtn}
          onClick={onLoadCustom}
          disabled={isLoading}
          aria-label="Load custom engine"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      
      {/* Preset engines */}
      {presetEngines.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Preset</span>
          <div className={styles.engineList}>
            {presetEngines.map((engine) => (
              <EngineCard
                key={engine.id}
                engine={engine}
                isSelected={currentEngine?.id === engine.id}
                onClick={() => onSelect(engine.id)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Custom engines */}
      {customEngines.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Custom</span>
          <div className={styles.engineList}>
            {customEngines.map((engine) => (
              <EngineCard
                key={engine.id}
                engine={engine}
                isSelected={currentEngine?.id === engine.id}
                onClick={() => onSelect(engine.id)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {engineList.length === 0 && (
        <div className={styles.empty}>
          {isLoading ? (
            <span className={styles.loadingText}>Loading engines...</span>
          ) : (
            <span className={styles.emptyText}>No engines loaded</span>
          )}
        </div>
      )}
    </div>
  );
}

interface EngineCardProps {
  engine: Engine;
  isSelected: boolean;
  onClick: () => void;
}

function EngineCard({ engine, isSelected, onClick }: EngineCardProps) {
  const caps = engine.capabilities;
  
  return (
    <button
      className={`${styles.engineCard} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      <div className={styles.engineHeader}>
        <span className={styles.engineName}>{engine.name}</span>
        {engine.isPreset && <span className={styles.presetBadge}>Preset</span>}
      </div>
      <div className={styles.engineDesc}>{engine.desc}</div>
      <div className={styles.capabilities}>
        <span className={caps.binarySafe ? styles.capActive : styles.capInactive}>
          {CAPABILITY_ABBREVIATIONS.binarySafe}
        </span>
        <span className={caps.selfInverse ? styles.capActive : styles.capInactive}>
          {CAPABILITY_ABBREVIATIONS.selfInverse}
        </span>
        <span className={caps.reversible ? styles.capActive : styles.capInactive}>
          {CAPABILITY_ABBREVIATIONS.reversible}
        </span>
        {caps.stateful && (
          <span className={styles.capActive}>
            {CAPABILITY_ABBREVIATIONS.stateful}
          </span>
        )}
      </div>
    </button>
  );
}

export default EngineSelector;
