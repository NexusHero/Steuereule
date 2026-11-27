import { useId, useState, type ReactNode } from 'react'
import { Pressable, Text, View, type LayoutChangeEvent, type TextStyle, type ViewStyle } from 'react-native'
import { Circle, Defs, G, Line, Pattern, Rect, Svg, Text as SvgText } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { formatNumber } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import type { ChartColumn, ChartModel, SegmentKind } from './historyChartModel'
import { thousands } from './historyFormat'

export interface HistoryChartProps {
  readonly model: ChartModel
  readonly selectedYear: number | null
  readonly onSelectYear: (year: number) => void
  readonly accessibilityLabel: string
  readonly height: number
  readonly testID: string
}

const X0 = 40
const RIGHT = 8
const Y0 = 28
const BOTTOM = 8

/** The colour of each part of a stacked bar: ink steps plus lime for what stays (Graphit: no red, green or violet in the plot). */
export function segmentColor(t: UiTheme, kind: SegmentKind): string {
  switch (kind) {
    case 'netto':
      return t.color.funke
    case 'steuern':
      return t.color.tinte2
    case 'sozialversicherung':
      return t.color.linieWeich
    case 'fahrtweg':
      return t.color.tinte
    case 'homeoffice':
      return t.color.tinte2
    case 'arbeitsmittel':
      return t.color.linie
    case 'sonstiges':
      return t.color.linieWeich
    case 'summeLautBescheid':
      return t.color.tinte2
  }
}

/**
 * One key figure over the years (mock `chart()`), in react-native-svg: Bescheid values solid, estimates
 * dashed or hatched with their range as label, open years as a gap that says so. The year buttons sit
 * under the chart, so a year is picked by keyboard and screen reader alike; the data table behind the
 * chart carries every number.
 */
export function HistoryChart({ model, selectedYear, onSelectYear, accessibilityLabel, height, testID }: HistoryChartProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [width, setWidth] = useState(340)
  const patternId = `schraffur${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const n = Math.max(model.columns.length, 1)
  const x1 = width - RIGHT
  const y1 = height - BOTTOM
  const slotWidth = (x1 - X0) / n
  const barWidth = Math.min(44, slotWidth * 0.55)
  const slot = (i: number) => X0 + slotWidth * i
  const cx = (i: number) => slot(i) + slotWidth / 2
  const span = model.max - model.min || 1
  const y = (v: number) => y1 - ((v - model.min) / span) * (y1 - Y0)
  const base = y(Math.max(model.min, 0))
  const tickText = (v: number) => (model.unit === 'percent' ? `${v}%` : v === 0 ? '0' : Math.abs(v) >= 1000 ? thousands(v) : formatNumber(v))

  const label = (i: number, yy: number, text: string, color = t.color.tinte, bold = false): ReactNode => (
    <SvgText x={cx(i)} y={yy} textAnchor="middle" fontSize={10} fontFamily={t.font.mono} {...(bold ? { fontWeight: t.weight.schwer } : {})} fill={color}>
      {text}
    </SvgText>
  )

  // An open year is a quiet word on the baseline, not a shape: an empty box read as a value.
  function gap(i: number, reason: 'offen' | 'nichtAblesbar'): ReactNode {
    return label(i, base - 6, tr(reason === 'offen' ? 'verlauf.chart.offen' : 'verlauf.chart.nichtAblesbar'), t.color.tinte2)
  }

  function column(c: ChartColumn, i: number): ReactNode {
    const left = cx(i) - barWidth / 2
    switch (c.kind) {
      case 'gap':
        return gap(i, c.reason)
      case 'stack': {
        let top = base
        const rects = c.segments.map((seg) => {
          if (seg.value <= 0) return null
          const h = (seg.value / span) * (y1 - Y0)
          top -= h
          return (
            <Rect
              key={seg.kind}
              x={left}
              y={top}
              width={barWidth}
              height={h}
              fill={segmentColor(t, seg.kind)}
              stroke={c.estimated ? t.color.tinte2 : t.color.karte}
              strokeWidth={c.estimated ? 1.5 : 1}
              {...(c.estimated ? { strokeDasharray: '3 2' } : {})}
            />
          )
        })
        const lineY = c.line === null ? null : y(c.line)
        return (
          <>
            {rects}
            {lineY === null ? null : <Line x1={slot(i) + 4} x2={slot(i) + slotWidth - 4} y1={lineY} y2={lineY} stroke={t.color.tinte2} strokeWidth={1.5} strokeDasharray="4 3" />}
            {label(i, Math.min(top, lineY ?? top) - 6, c.label)}
          </>
        )
      }
      case 'range': {
        const yl = y(Math.min(c.from, c.to))
        const yh = y(Math.max(c.from, c.to))
        return (
          <>
            <Line x1={cx(i)} x2={cx(i)} y1={base} y2={yl} stroke={t.color.tinte2} strokeWidth={1.5} strokeDasharray="2 3" />
            <Rect x={left} y={yh} width={barWidth} height={Math.max(yl - yh, 3)} fill={`url(#${patternId})`} stroke={t.color.tinte2} strokeWidth={1.5} strokeDasharray="3 2" />
            {label(i, yh - 6, c.label)}
          </>
        )
      }
      case 'refund': {
        const yv = y(c.value)
        const barTop = Math.min(yv, base)
        const barHeight = Math.max(Math.abs(base - yv), 1.5)
        const yd = c.declared === null ? null : y(c.declared)
        const top = Math.min(barTop, yd ?? barTop)
        return (
          <>
            {yd !== null && c.declared !== null && c.declared > c.value ? (
              <Rect x={left} y={yd} width={barWidth} height={yv - yd} fill="none" stroke={t.color.tinte2} strokeWidth={1.5} strokeDasharray="3 2" />
            ) : null}
            <Rect x={left} y={barTop} width={barWidth} height={barHeight} fill={c.year === selectedYear ? t.color.tinte : t.color.linie} rx={2} />
            {/* A back payment is labelled under its bar: above the baseline it ran into the neighbouring years. */}
            {label(i, c.value < 0 ? yv + 13 : top - 6, c.label)}
            {c.cutLabel === null ? null : label(i, top - 18, c.cutLabel, t.color.tinte2, true)}
          </>
        )
      }
      case 'quote': {
        const exact = c.from === c.to
        return (
          <>
            {exact ? (
              <Circle cx={cx(i)} cy={y(c.from)} r={4.5} fill={t.color.tinte} />
            ) : (
              <Rect x={cx(i) - 7} y={y(c.to) - 3} width={14} height={y(c.from) - y(c.to) + 6} rx={4} fill={`url(#${patternId})`} stroke={t.color.tinte2} strokeWidth={1.5} />
            )}
            {label(i, exact ? y(c.from) + 18 : y(c.to) - 10, c.label)}
            {c.marginal === null ? null : (
              <>
                <Circle cx={cx(i)} cy={y(c.marginal)} r={3} fill={t.color.tinte2} />
                {label(i, y(c.marginal) - 8, `${Math.round(c.marginal)}%`, t.color.tinte2)}
              </>
            )}
          </>
        )
      }
    }
  }

  // The quote's lines: effective and marginal, only between years of the same Veranlagungsart.
  const lines: ReactNode[] = []
  if (model.metric === 'steuerquote') {
    const changeYears = new Set(model.filingTypeChanges.map((c) => c.year))
    model.columns.forEach((c, i) => {
      const prev = model.columns[i - 1]
      if (i === 0 || !prev || prev.kind !== 'quote' || c.kind !== 'quote' || changeYears.has(c.year)) return
      lines.push(
        <Line key={`q${c.year}`} x1={cx(i - 1)} y1={y((prev.from + prev.to) / 2)} x2={cx(i)} y2={y((c.from + c.to) / 2)} stroke={t.color.tinte} strokeWidth={2} {...(c.from !== c.to || prev.from !== prev.to ? { strokeDasharray: '4 3' } : {})} />,
      )
      if (prev.marginal !== null && c.marginal !== null) lines.push(<Line key={`m${c.year}`} x1={cx(i - 1)} y1={y(prev.marginal)} x2={cx(i)} y2={y(c.marginal)} stroke={t.color.tinte2} strokeWidth={1.5} />)
    })
  }

  return (
    <View testID={testID}>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(240, Math.round(e.nativeEvent.layout.width)))}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessibilityRole="image" accessibilityLabel={accessibilityLabel} testID={`${testID}-svg`}>
          <Defs>
            <Pattern id={patternId} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Rect width={5} height={5} fill={t.color.karte} />
              <Line x1={0} y1={0} x2={0} y2={5} stroke={t.color.linie} strokeWidth={2} />
            </Pattern>
          </Defs>
          {model.ticks.map((tick) => (
            <G key={`t${tick}`}>
              <Line x1={X0} x2={x1} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? t.color.tinte2 : t.color.linieWeich} strokeWidth={1} />
              <SvgText x={X0 - 5} y={y(tick) + 3} textAnchor="end" fontSize={10} fontFamily={t.font.mono} fill={t.color.tinte2}>
                {tickText(tick)}
              </SvgText>
            </G>
          ))}
          {model.columns.map((c, i) =>
            c.year === selectedYear ? <Rect key={`sel${c.year}`} x={slot(i) + 2} y={Y0 - 4} width={slotWidth - 4} height={y1 - Y0 + 8} rx={8} fill={t.color.linieWeich} opacity={0.5} /> : null,
          )}
          {model.filingTypeChanges.map((change) => {
            const i = model.columns.findIndex((c) => c.year === change.year)
            if (i <= 0) return null
            return (
              // The legend names the line; the words in the plot collided with the labels above the bars.
              <Line key={`w${change.year}`} x1={slot(i)} x2={slot(i)} y1={Y0 - 4} y2={y1} stroke={t.color.tinte2} strokeWidth={1.5} strokeDasharray="4 3" />
            )
          })}
          {lines}
          {model.columns.map((c, i) => (
            <G key={c.year}>{column(c, i)}</G>
          ))}
        </Svg>
      </View>
      <View style={[s.years, { paddingLeft: X0, paddingRight: RIGHT }]}>
        {model.columns.map((c) => {
          const active = c.year === selectedYear
          return (
            <Pressable
              key={c.year}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tr('verlauf.chart.jahrWaehlen', { jahr: c.year })}
              onPress={() => onSelectYear(c.year)}
              style={s.yearButton}
              testID={`${testID}-jahr-${c.year}`}
            >
              <Text style={[s.yearText, active ? s.yearTextActive : null]}>{c.year}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const years: ViewStyle = { flexDirection: 'row' }
  const yearButton: ViewStyle = { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 32, borderRadius: t.radius.s }
  const yearText: TextStyle = { ...t.type.meta, color: t.color.tinte2 }
  // The lime rule under the picked year is the chart's one accent (Graphit).
  const yearTextActive: TextStyle = { color: t.color.tinte, fontWeight: t.weight.schwer, borderBottomWidth: 3, borderBottomColor: t.color.funke }
  return { years, yearButton, yearText, yearTextActive }
}
