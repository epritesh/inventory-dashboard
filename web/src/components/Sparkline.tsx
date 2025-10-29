import React from 'react'

type Props = {
  data: Array<{ date: string; value: number }>
  width?: number
  height?: number
  stroke?: string
  fill?: string
  thick?: boolean
  ariaLabel?: string
}

export const Sparkline: React.FC<Props> = ({ data, width = 120, height = 32, stroke = 'rgba(249,149,0,0.9)', fill = 'rgba(249,149,0,0.15)', thick = false, ariaLabel }) => {
  const padding = 3
  const w = width
  const h = height
  const innerW = w - padding * 2
  const innerH = h - padding * 2
  const values = data.map(d => d.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const range = max - min || 1
  const pts = data.map((d, i) => {
    const x = padding + (innerW * (data.length <= 1 ? 1 : i / (data.length - 1)))
    const y = padding + innerH - ((d.value - min) / range) * innerH
    return `${x},${y}`
  }).join(' ')
  const areaPts = `${padding},${padding + innerH} ${pts} ${padding + innerW},${padding + innerH}`
  return (
    <svg width={w} height={h} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel} focusable="false">
      <polyline points={areaPts} fill={fill} stroke="none" />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={thick ? 2 : 1.25} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default Sparkline
