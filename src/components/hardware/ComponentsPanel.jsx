"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { X, Plus, Trash2, RotateCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useSim } from '../../lib/simState';
import {
  makeStubChip,
  parseChipPins,
  chipModuleNames,
  MAX_COMPONENTS,
} from '../../lib/chipSchema';
import { nextChipPosition, nextRotation } from './chipGeometry';

// ---- helpers -----------------------------------------------------------------

function newId(prefix = 'c') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Parse comma- or space-separated names from a text field. */
function parsePinNames(text) {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z_]\w*$/.test(s));
}

// Debounce a callback — returns a stable ref-backed debounced version.
// fnRef is kept current via useEffect (not direct render assignment)
// to satisfy the react-hooks/refs lint rule.
function useDebounced(fn, delay) {
  const timerRef = useRef(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  return useCallback(
    (...args) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay]
  );
}

// ---- sub-components ----------------------------------------------------------

/** One row in the chip list. */
function ChipRow({ chip, isSelected, onSelect, onDelete, onRotate }) {
  const inputCount = chip.pins.filter((p) => p.dir === 'input').length;
  const outputCount = chip.pins.filter((p) => p.dir !== 'input').length;
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[12px] cursor-pointer transition-colors ${
        isSelected
          ? 'border-accent bg-accent/10 text-text-primary'
          : 'border-edge bg-elevated text-text-primary hover:bg-hover'
      }`}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate font-mono font-medium">{chip.name}</div>
        <div className="text-text-muted text-[10px]">
          {inputCount}in / {outputCount}out
          {chip.pins.length === 0 ? ' — no parsed pins' : ''}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRotate(chip.id); }}
        className="text-text-muted hover:text-text-primary shrink-0"
        title="Rotate 90° (also: select chip on board + press R)"
      >
        <RotateCw size={13} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(chip.id); }}
        className="text-text-muted hover:text-danger shrink-0"
        title="Delete chip"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/** Quick-create form for a new chip. */
function AddChipForm({ components, boardWidth, boardHeight, onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [inputsStr, setInputsStr] = useState('A,B');
  const [outputsStr, setOutputsStr] = useState('C,D');
  const [error, setError] = useState(null);

  const nameValid = /^[A-Za-z_]\w*$/.test(name.trim());
  const nameTaken = components.some((c) => c.name === name.trim());

  const handleAdd = () => {
    const n = name.trim();
    if (!n) { setError('Name is required.'); return; }
    if (!nameValid) { setError('Name must be a valid C identifier.'); return; }
    if (nameTaken) { setError(`Name "${n}" is already used.`); return; }
    if (components.length >= MAX_COMPONENTS) {
      setError(`Maximum ${MAX_COMPONENTS} components reached.`);
      return;
    }
    const inputs = parsePinNames(inputsStr);
    const outputs = parsePinNames(outputsStr);
    const source = makeStubChip(n, inputs, outputs);
    const pins = parseChipPins(source, n);
    const { x, y } = nextChipPosition(components, boardWidth, boardHeight);
    const chip = { id: newId('c'), name: n, x, y, pins, source };
    onAdd(chip);
  };

  return (
    <div className="p-3 bg-elevated border border-edge rounded-lg flex flex-col gap-2 text-[12px]">
      <div className="text-[11px] font-semibold text-text-secondary">Add chip</div>
      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
        Chip name
        <input
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onCancel(); }}
          placeholder="my_chip"
          className={`bg-base border rounded px-2 py-1 text-[12px] text-text-primary font-mono outline-none focus:border-accent ${
            name && !nameValid ? 'border-danger' : 'border-edge'
          }`}
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
        Inputs (comma-separated)
        <input
          value={inputsStr}
          onChange={(e) => setInputsStr(e.target.value)}
          placeholder="A,B"
          className="bg-base border border-edge rounded px-2 py-1 text-[12px] text-text-primary font-mono outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
        Outputs (comma-separated)
        <input
          value={outputsStr}
          onChange={(e) => setOutputsStr(e.target.value)}
          placeholder="C,D"
          className="bg-base border border-edge rounded px-2 py-1 text-[12px] text-text-primary font-mono outline-none focus:border-accent"
        />
      </label>
      {error && <div className="text-[11px] text-danger">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-2.5 py-1 rounded text-[12px] text-text-secondary hover:bg-hover">
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className="px-2.5 py-1 rounded text-[12px] font-medium bg-accent/90 hover:bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/**
 * Per-chip editor: a single C-source Monaco tab. No separate testbench tab and no
 * standalone "Test chip" button here (unlike nikaV) — a chip has no `main()` of its own,
 * it's a `_step()` function co-compiled into the firmware ELF, so it isn't independently
 * runnable the way a bare Verilog module is under an auto-generated testbench.
 */
function ChipEditor({ chip, onSourceChange }) {
  const [parseError, setParseError] = useState(null);

  // Debounced re-parse on source change — fires after 600 ms idle.
  const debouncedParse = useDebounced((val, name) => {
    if (!val) { setParseError(null); return; }
    const mods = chipModuleNames(val);
    if (!mods.includes(name)) {
      setParseError(`"// module ${name}(...);" not found in source. The declared name must match the chip name.`);
    } else {
      const pins = parseChipPins(val, name);
      if (pins.length === 0) {
        setParseError(`No pins parsed from the "// module ${name}(...);" declaration.`);
      } else if (!new RegExp(`\\b${name}_step\\s*\\(`).test(val)) {
        setParseError(`Missing "${name}_step(void)" function.`);
      } else {
        setParseError(null);
      }
    }
    onSourceChange(val);
  }, 600);

  const handleChange = (val) => {
    debouncedParse(val ?? '', chip.name);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="border border-edge rounded overflow-hidden" style={{ height: 220 }}>
        <Editor
          height="220px"
          path={`chip-${chip.id}.c`}
          defaultLanguage="c"
          theme="vs-dark"
          value={chip.source}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineHeight: 18,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>

      {parseError && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-2 py-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-px" />
          <span>{parseError}</span>
        </div>
      )}
    </div>
  );
}

// ---- main panel --------------------------------------------------------------

/**
 * ComponentsPanel — right-side panel for external chips wired to the board. No
 * "Advanced" mode gate (this project doesn't have that concept yet) — mounted whenever
 * HardwareViewer's Components button is toggled on.
 */
export default function ComponentsPanel({ onClose, focusChipId, board }) {
  const { components, setComponents } = useSim();

  const boardWidth = board?.width || 1774;
  const boardHeight = board?.height || 887;

  // Which chip row is expanded to show its editor
  const [expandedId, setExpandedId] = useState(null);
  // Show the add-chip quick-create form
  const [showAddForm, setShowAddForm] = useState(false);

  // When focusChipId changes (from double-click on board), expand that chip.
  useEffect(() => {
    if (focusChipId) {
      setExpandedId(focusChipId);
      setShowAddForm(false);
    }
  }, [focusChipId]);

  const handleDelete = (id) => {
    setComponents((cur) => cur.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleRotate = (id) => {
    setComponents((cur) => cur.map((c) => (c.id === id ? { ...c, rotation: nextRotation(c.rotation) } : c)));
  };

  const handleAdd = (chip) => {
    setComponents((cur) => [...cur, chip]);
    setShowAddForm(false);
    setExpandedId(chip.id);
  };

  const handleSourceChange = useCallback((chipId, val) => {
    setComponents((cur) =>
      cur.map((c) => {
        if (c.id !== chipId) return c;
        const pins = parseChipPins(val, c.name);
        return { ...c, source: val, pins };
      })
    );
  }, [setComponents]);

  const atCap = components.length >= MAX_COMPONENTS;

  return (
    <div className="absolute top-2 right-2 bottom-2 w-[360px] bg-panel border border-edge rounded-lg shadow-xl flex flex-col z-30 overflow-hidden">
      {/* Header */}
      <div className="h-9 shrink-0 flex items-center justify-between px-3 border-b border-edge">
        <span className="text-[13px] font-semibold text-text-secondary">
          Components{components.length ? ` (${components.length}/${MAX_COMPONENTS})` : ''}
        </span>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {components.length === 0 && !showAddForm && (
          <div className="text-[12px] text-text-muted p-2">
            No custom chips yet. Add one to co-simulate it alongside the firmware.
          </div>
        )}

        {components.map((chip) => (
          <div key={chip.id}>
            {/* Row */}
            <div className="flex items-center gap-1">
              <button
                className="text-text-muted hover:text-text-primary"
                onClick={() => setExpandedId((id) => (id === chip.id ? null : chip.id))}
                title={expandedId === chip.id ? 'Collapse editor' : 'Open editor'}
              >
                {expandedId === chip.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <div className="flex-1 min-w-0">
                <ChipRow
                  chip={chip}
                  isSelected={expandedId === chip.id}
                  onSelect={() => setExpandedId((id) => (id === chip.id ? null : chip.id))}
                  onDelete={handleDelete}
                  onRotate={handleRotate}
                />
              </div>
            </div>

            {/* Expanded editor */}
            {expandedId === chip.id && (
              <div className="ml-5 mt-1.5 p-3 bg-elevated border border-edge rounded-lg">
                <ChipEditor
                  chip={chip}
                  onSourceChange={(val) => handleSourceChange(chip.id, val)}
                />
              </div>
            )}
          </div>
        ))}

        {showAddForm && (
          <AddChipForm
            components={components}
            boardWidth={boardWidth}
            boardHeight={boardHeight}
            onAdd={handleAdd}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </div>

      {/* Add button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          disabled={atCap}
          className="m-2 flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-edge text-[12px] text-text-secondary hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
          title={atCap ? `Maximum ${MAX_COMPONENTS} chips reached` : 'Add a new custom chip'}
        >
          <Plus size={13} />
          {atCap ? `Cap reached (${MAX_COMPONENTS})` : 'Add chip'}
        </button>
      )}
    </div>
  );
}
