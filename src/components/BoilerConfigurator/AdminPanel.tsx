import { useState, useEffect, useCallback, useRef } from 'react'
import { useConfigurator } from '../../hooks/useConfigurator'
import type { Vec3 } from '../../data/configurations'

function round(v: number, d = 3) {
  return Math.round(v * 10 ** d) / 10 ** d
}

// Hide native number input spinners in admin panel
const hideSpinnersCSS = `
.admin-num-input::-webkit-outer-spin-button,
.admin-num-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.admin-num-input {
  -moz-appearance: textfield;
}
`

const spinBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  background: '#334155',
  color: '#e2e8f0',
  border: '1px solid #475569',
  borderRadius: 4,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  userSelect: 'none',
  flexShrink: 0,
}

function Slider({
  label,
  value,
  onChange,
  min = -3,
  max = 3,
  step = 0.001,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const valueRef = useRef(value)
  valueRef.current = value
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopHold = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
  }, [])

  const startHold = useCallback((direction: 1 | -1) => {
    stopHold()
    // Initial delay before repeat starts (300ms), then repeat every 60ms
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        const next = round(valueRef.current + step * direction, 4)
        onChange(next)
      }, 60)
    }, 300)
  }, [step, onChange, stopHold])

  // Cleanup on unmount
  useEffect(() => stopHold, [stopHold])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <label style={{ width: 16, fontWeight: 600, fontSize: 12 }}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, height: 4 }}
      />
      <button
        style={spinBtnStyle}
        onClick={() => onChange(round(value - step, 4))}
        onMouseDown={() => startHold(-1)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={() => startHold(-1)}
        onTouchEnd={stopHold}
        title="Уменьшить"
      >
        −
      </button>
      <input
        className="admin-num-input"
        type="number"
        step={step}
        value={round(value)}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        style={{
          width: 70,
          height: 28,
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #475569',
          borderRadius: 4,
          padding: '2px 6px',
          fontSize: 13,
          textAlign: 'right',
        }}
      />
      <button
        style={spinBtnStyle}
        onClick={() => onChange(round(value + step, 4))}
        onMouseDown={() => startHold(1)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={() => startHold(1)}
        onTouchEnd={stopHold}
        title="Увеличить"
      >
        +
      </button>
    </div>
  )
}

export function AdminPanel() {
  const selectedPart = useConfigurator((s) => s.selectedPart)
  const getPartById = useConfigurator((s) => s.getPartById)
  const setAdminOverride = useConfigurator((s) => s.setAdminOverride)
  const adminOverrides = useConfigurator((s) => s.adminOverrides)

  const [pos, setPos] = useState<Vec3>({ x: 0, y: 0, z: 0 })
  const [rot, setRot] = useState<Vec3>({ x: 0, y: 0, z: 0 })
  const [copied, setCopied] = useState(false)

  // Load current values when part selection changes
  useEffect(() => {
    if (!selectedPart) return
    const part = getPartById(selectedPart)
    if (!part) return
    setPos({ ...part.worldPosition })
    setRot({ ...part.worldRotation })
  }, [selectedPart, getPartById])

  const updatePos = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      if (!selectedPart) return
      const newPos = { ...pos, [axis]: value }
      setPos(newPos)
      setAdminOverride(selectedPart, { position: newPos, rotation: rot })
    },
    [selectedPart, pos, rot, setAdminOverride]
  )

  const updateRot = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      if (!selectedPart) return
      const newRot = { ...rot, [axis]: value }
      setRot(newRot)
      setAdminOverride(selectedPart, { position: pos, rotation: newRot })
    },
    [selectedPart, pos, rot, setAdminOverride]
  )

  const copyCode = useCallback(() => {
    const piStr = (v: number) => {
      const ratio = round(v / Math.PI, 2)
      if (ratio === 0) return '0'
      if (ratio === 1) return 'Math.PI'
      if (ratio === -1) return '-Math.PI'
      if (ratio === 0.5) return 'Math.PI / 2'
      if (ratio === -0.5) return '-Math.PI / 2'
      if (ratio === 0.25) return 'Math.PI / 4'
      if (ratio === -0.25) return '-Math.PI / 4'
      return `${round(v)}`
    }
    const code = `  ${selectedPart}_point: {\n    position: { x: ${round(pos.x)}, y: ${round(pos.y)}, z: ${round(pos.z)} },\n    rotation: { x: ${piStr(rot.x)}, y: ${piStr(rot.y)}, z: ${piStr(rot.z)} },\n  },`
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [selectedPart, pos, rot])

  if (!selectedPart) {
    return (
      <div style={panelStyle}>
        <style>{hideSpinnersCSS}</style>
        <div style={headerStyle}>Admin Mode</div>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>
          Кликните на деталь в 3D сцене для редактирования позиции
        </p>
      </div>
    )
  }

  const part = getPartById(selectedPart)
  if (!part) return null

  const hasOverride = !!adminOverrides[selectedPart]

  return (
    <div style={panelStyle}>
      <style>{hideSpinnersCSS}</style>
      <div style={headerStyle}>Admin: {part.label}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
        id: <code>{part.id}</code> | model: <code>{part.model}</code>
        {part.attachTo && (
          <>
            {' '}| attach: <code>{part.attachTo}</code>
          </>
        )}
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Position (meters)</div>
        <Slider label="X" value={pos.x} onChange={(v) => updatePos('x', v)} />
        <Slider label="Y" value={pos.y} onChange={(v) => updatePos('y', v)} />
        <Slider label="Z" value={pos.z} onChange={(v) => updatePos('z', v)} />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Rotation (radians)</div>
        <Slider
          label="X"
          value={rot.x}
          onChange={(v) => updateRot('x', v)}
          min={-Math.PI}
          max={Math.PI}
          step={Math.PI / 36}
        />
        <Slider
          label="Y"
          value={rot.y}
          onChange={(v) => updateRot('y', v)}
          min={-Math.PI}
          max={Math.PI}
          step={Math.PI / 36}
        />
        <Slider
          label="Z"
          value={rot.z}
          onChange={(v) => updateRot('z', v)}
          min={-Math.PI}
          max={Math.PI}
          step={Math.PI / 36}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={copyCode} style={btnStyle}>
          {copied ? 'Скопировано!' : 'Копировать код'}
        </button>
        {hasOverride && (
          <button
            onClick={() => {
              const p = getPartById(selectedPart)
              if (!p) return
              // Reset by removing override — re-read from base
              const newOverrides = { ...adminOverrides }
              delete newOverrides[selectedPart]
              try { localStorage.setItem('adminOverrides', JSON.stringify(newOverrides)) } catch {}
              useConfigurator.setState({ adminOverrides: newOverrides })
            }}
            style={{ ...btnStyle, background: '#7f1d1d' }}
          >
            Сброс
          </button>
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 8,
          background: '#0f172a',
          borderRadius: 6,
          fontSize: 10,
          fontFamily: 'monospace',
          color: '#94a3b8',
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}
      >
        {`pos: { x: ${round(pos.x)}, y: ${round(pos.y)}, z: ${round(pos.z)} }\nrot: { x: ${round(rot.x)}, y: ${round(rot.y)}, z: ${round(rot.z)} }`}
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  width: 340,
  background: '#1e293bee',
  backdropFilter: 'blur(12px)',
  borderRadius: 12,
  border: '1px solid #334155',
  padding: 16,
  color: '#e2e8f0',
  zIndex: 1000,
  fontFamily: 'system-ui, sans-serif',
}

const headerStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 8,
  color: '#f59e0b',
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 8,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const btnStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 12px',
  background: '#1d4ed8',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}
