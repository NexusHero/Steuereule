import type { HistoryFigure, NetFigures, WorkExpenseFigures, YearHistoryEntry } from '@steuereule/core'
import { toDiffDto, toLessonDto } from '../assessment/assessment-diff.mapper.js'
import type { HistoryFigureDto, NetFiguresDto, WorkExpenseFiguresDto, YearHistoryEntryDto, YearHistoryResponseDto } from './dto/year-history.dto.js'
import type { YearHistory } from './year-history.service.js'

/** The core's tiered value as the wire carries it: one flat shape, only the fields of its tier set. */
export function toFigureDto(f: HistoryFigure): HistoryFigureDto {
  const delta =
    f.delta.kind === 'exact'
      ? { kind: 'exact' as const, absolute: f.delta.absolute, percent: f.delta.percent }
      : f.delta.kind === 'range'
        ? { kind: 'range' as const, absoluteRange: { ...f.delta.absolute }, percentRange: f.delta.percent === null ? null : { ...f.delta.percent } }
        : { kind: 'none' as const, reason: f.delta.reason }
  if (f.tier === 'bescheid') return { tier: f.tier, value: f.value, source: f.source, delta }
  if (f.tier === 'schaetzung') return { tier: f.tier, range: { ...f.range }, source: f.source, delta }
  return { tier: f.tier, missing: [...f.missing], delta }
}

function netDto(n: NetFigures): NetFiguresDto {
  return {
    brutto: toFigureDto(n.brutto),
    lohnsteuer: toFigureDto(n.lohnsteuer),
    solidaritaetszuschlag: toFigureDto(n.solidaritaetszuschlag),
    kirchensteuer: toFigureDto(n.kirchensteuer),
    sozialversicherung: toFigureDto(n.sozialversicherung),
    netto: toFigureDto(n.netto),
    nettoQuote: toFigureDto(n.nettoQuote),
    exchangeRates: n.exchangeRates.map((r) => ({ ...r })),
  }
}

function wkDto(w: WorkExpenseFigures): WorkExpenseFiguresDto {
  return {
    total: toFigureDto(w.total),
    angesetzt: toFigureDto(w.angesetzt),
    parts: w.parts === null ? null : { ...w.parts },
    partsSource: w.partsSource,
    pauschbetrag: w.pauschbetrag,
    belowLumpSum: w.belowLumpSum,
  }
}

export function toEntryDto(e: YearHistoryEntry): YearHistoryEntryDto {
  return {
    year: e.year,
    filingType: e.filingType,
    filingTypeChanged: e.filingTypeChanged,
    eckjahr: e.eckjahr,
    tier: e.tier,
    missing: [...e.missing],
    persons: [...e.persons],
    netto: { beide: { ...netDto(e.netto.beide), nettoNachErstattung: toFigureDto(e.netto.beide.nettoNachErstattung) }, A: netDto(e.netto.A), B: e.netto.B === null ? null : netDto(e.netto.B) },
    werbungskosten: { beide: wkDto(e.werbungskosten.beide), A: wkDto(e.werbungskosten.A), B: e.werbungskosten.B === null ? null : wkDto(e.werbungskosten.B) },
    erstattung: {
      amount: toFigureDto(e.erstattung.amount),
      declared: e.erstattung.declared,
      difference: e.erstattung.difference,
      estimateBeforeAssessment: e.erstattung.estimateBeforeAssessment === null ? null : { ...e.erstattung.estimateBeforeAssessment },
      sumOfSingleFilings: e.erstattung.sumOfSingleFilings,
    },
    steuerquote: {
      incomeTax: toFigureDto(e.steuerquote.incomeTax),
      effective: toFigureDto(e.steuerquote.effective),
      marginal: e.steuerquote.marginal === null ? null : toFigureDto(e.steuerquote.marginal),
    },
  }
}

export function toYearHistoryDto(h: YearHistory): YearHistoryResponseDto {
  return {
    today: h.today,
    years: h.years.map(toEntryDto),
    list: h.list.map((l) => ({ ...l })),
    openItems: h.openItems.map((item) => {
      if (item.kind === 'einspruchsfrist') return { ...item, deadline: { ...item.deadline } }
      if (item.kind === 'wartet-auf-bescheid') return { ...item, repeatedCuts: item.repeatedCuts.map((c) => ({ ...c })) }
      return { ...item, missing: [...item.missing] }
    }),
    diffs: h.diffs.map((d) => ({
      year: d.year,
      person: d.person,
      submittedOn: d.submittedOn,
      assessmentDate: d.assessmentDate,
      deadline: d.deadline === null ? null : { ...d.deadline },
      diff: toDiffDto(d.diff),
      lessons: d.lessons.map(toLessonDto),
    })),
    maskLessons: h.maskLessons === null ? null : { year: h.maskLessons.year, fromYear: h.maskLessons.fromYear, lessons: h.maskLessons.lessons.map(toLessonDto) },
  }
}
