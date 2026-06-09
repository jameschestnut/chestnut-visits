'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const SHIFT_GROUPS = [
  {
    key:     'first_early',
    label:   '1st Line — Early',
    hours:   '08:00–16:30',
    tier:    'first_line',
    colour:  '#1E40AF',
    lightBg: '#eff6ff',
    border:  '#bfdbfe',
    slots: [
      { key: 'first_early_am',    label: 'AM',    hours: '08:00–12:00' },
      { key: 'first_early_lunch', label: 'Lunch', hours: '12:00–12:30' },
      { key: 'first_early_pm',    label: 'PM',    hours: '12:30–16:30' },
    ],
  },
  {
    key:     'second',
    label:   '2nd Line',
    hours:   '08:30–17:00',
    tier:    'second_line',
    colour:  '#92400E',
    lightBg: '#fffbeb',
    border:  '#fde68a',
    slots: [
      { key: 'second_am',    label: 'AM',    hours: '08:30–12:30' },
      { key: 'second_lunch', label: 'Lunch', hours: '12:30–13:00' },
      { key: 'second_pm',    label: 'PM',    hours: '13:00–17:00' },
    ],
  },
  {
    key:     'first_late',
    label:   '1st Line — Late',
    hours:   '09:00–17:30',
    tier:    'first_line',
    colour:  '#065F46',
    lightBg: '#f0fdf9',
    border:  '#a7f3d0',
    slots: [
      { key: 'first_late_am',    label: 'AM',    hours: '09:00–13:00' },
      { key: 'first_late_lunch', label: 'Lunch', hours: '13:00–13:30' },
      { key: 'first_late_pm',    label: 'PM',    hours: '13:30–17:30' },
    ],
  },
]

const ALL_SLOTS = SHIFT_GROUPS.flatMap(g =>
  g.slots.map(s => ({ ...s, tier: g.tier, groupKey: g.key, groupLabel: g.label, colour: g.colour, lightBg: g.lightBg, border: g.border }))
)

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri']

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getWeekDates(offset: number) {
  const today  = new Date()
  const dow    = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() + (dow === 0 ? 1 : 1 - dow) + offset * 7)
  const todayStr = toDateStr(today)
  return DAY_KEYS.map((key, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      key,
      date:    d,
      dateStr: toDateStr(d),
      label:   d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      isToday: toDateStr(d) === todayStr,
    }
  })
}

interface RotaEntry {
  id: string
  rota_date: string
  shift_type: string
  technician_id: string
}

interface Technician {
  id: string
  full_name: string
  initials: string
  support_tiers: string[] | null
}

interface Popover {
  dateStr: string
  slotKey: string
  tier: string
  groupKey: string
}

export default function SupportRotaPage() {
  const supabase = createClient()

  const [weekOffset, setWeekOffset]   = useState(0)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [rota, setRota]               = useState<RotaEntry[]>([])
  const [busyTechs, setBusyTechs]     = useState<{ technician_id: string; visit_date: string }[]>([])
  const [loading, setLoading]         = useState(true)
  const [popover, setPopover]         = useState<Popover | null>(null)
  const [saving, setSaving]           = useState(false)

  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0].dateStr
  const weekEnd   = weekDates[4].dateStr

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: techs }, { data: rotaData }, { data: visitsData }] = await Promise.all([
        supabase.from('technicians')
          .select('id, full_name, initials, support_tiers')
          .eq('is_active', true)
          .order('full_name'),
        supabase.from('support_rota')
          .select('id, rota_date, shift_type, technician_id')
          .gte('rota_date', weekStart)
          .lte('rota_date', weekEnd),
        supabase.from('visits')
          .select('technician_id, visit_date')
          .gte('visit_date', weekStart)
          .lte('visit_date', weekEnd)
          .in('status', ['confirmed', 'completed']),
      ])
      setTechnicians(techs ?? [])
      setRota(rotaData ?? [])
      setBusyTechs(visitsData ?? [])
      setLoading(false)
    }
    load()
  }, [weekOffset])

  function getEntries(dateStr: string, slotKey: string): RotaEntry[] {
    return rota.filter(r => r.rota_date === dateStr && r.shift_type === slotKey)
  }

  function isBusy(techId: string, dateStr: string): boolean {
    return busyTechs.some(v => v.technician_id === techId && v.visit_date === dateStr)
  }

  function hasShiftConflict(techId: string, dateStr: string, groupKey: string): boolean {
    const conflictingGroup = groupKey === 'first_early' ? 'first_late' : groupKey === 'first_late' ? 'first_early' : null
    if (!conflictingGroup) return false
    const conflictSlotKeys = SHIFT_GROUPS.find(g => g.key === conflictingGroup)?.slots.map(s => s.key) ?? []
    return rota.some(r => r.technician_id === techId && r.rota_date === dateStr && conflictSlotKeys.includes(r.shift_type))
  }

  function isAssigned(techId: string, dateStr: string, slotKey: string): boolean {
    return rota.some(r => r.technician_id === techId && r.rota_date === dateStr && r.shift_type === slotKey)
  }

  async function removeEntry(entryId: string) {
    setSaving(true)
    await supabase.from('support_rota').delete().eq('id', entryId)
    setRota(prev => prev.filter(r => r.id !== entryId))
    setSaving(false)
  }

  async function toggle(techId: string) {
    if (!popover) return
    setSaving(true)
    const { dateStr, slotKey } = popover
    const existing = rota.find(r => r.technician_id === techId && r.rota_date === dateStr && r.shift_type === slotKey)
    if (existing) {
      await supabase.from('support_rota').delete().eq('id', existing.id)
      setRota(prev => prev.filter(r => r.id !== existing.id))
    } else {
      const { data } = await supabase.from('support_rota')
        .insert({ rota_date: dateStr, shift_type: slotKey, technician_id: techId })
        .select()
        .single()
      if (data) setRota(prev => [...prev, data])
    }
    setSaving(false)
  }

  const nonLunchSlots = ALL_SLOTS.filter(s => s.label !== 'Lunch')
  const gaps = weekDates.flatMap(d =>
    nonLunchSlots.filter(s => getEntries(d.dateStr, s.key).length === 0)
      .map(s => ({ date: d.label, slot: `${s.groupLabel} ${s.label}` }))
  )

  const weekLabel = `${weekDates[0].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${weekDates[4].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Support Rota</h1>
          <p className="text-xs text-gray-400 mt-0.5">Phone lines open 08:30–17:00 · Support hours 08:00–17:30</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setWeekOffset(w => w - 1)}
            className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">‹</button>
          <span className="text-xs font-medium text-gray-700 w-44 text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => w + 1)}
            className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">›</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)}
              className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded border border-gray-200">
              Today
            </button>
          )}
        </div>
      </div>

      {!loading && gaps.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2">
          <span className="text-amber-500 text-sm mt-0.5">⚠</span>
          <div>
            <p className="text-xs font-medium text-amber-800">{gaps.length} unassigned slot{gaps.length !== 1 ? 's' : ''} this week</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {gaps.slice(0, 4).map(g => `${g.date} – ${g.slot}`).join(' · ')}
              {gaps.length > 4 && ` · +${gaps.length - 4} more`}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="border-collapse text-xs" style={{ minWidth: 700, width: '100%' }}>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 border-r border-gray-100" style={{ width: 160, minWidth: 160 }}>Shift</th>
                {weekDates.map(d => (
                  <th key={d.key} className="px-3 py-3 font-medium text-center border-r border-gray-100 last:border-r-0" style={{ minWidth: 150 }}>
                    <span className={d.isToday ? 'text-white px-2 py-0.5 rounded-full' : 'text-gray-500'}
                      style={d.isToday ? { background: '#46DA26' } : {}}>
                      {d.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHIFT_GROUPS.map((group, gi) => (
                <tr key={group.key} className={`border-b border-gray-100 last:border-b-0 ${gi % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  {/* Shift label */}
                  <td className="px-4 py-3 border-r border-gray-100 align-top">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: group.colour }} />
                      <span className="font-semibold text-gray-800">{group.label}</span>
                    </div>
                    <div className="text-gray-400 text-xs">{group.hours}</div>
                  </td>

                  {/* Day cells */}
                  {weekDates.map(d => (
                    <td key={d.key} className="px-3 py-3 border-r border-gray-100 last:border-r-0 align-top">
                      <div className="space-y-2">
                        {group.slots.map(slot => {
                          const isLunch = slot.label === 'Lunch'
                          const entries = getEntries(d.dateStr, slot.key)
                          return (
                            <div key={slot.key}>
                              <div className="flex items-center gap-1 mb-1">
                                <span className="font-medium text-gray-500">{slot.label}</span>
                                <span className="text-gray-300">{slot.hours}</span>
                              </div>
                              {isLunch ? (
                                <div className="text-gray-300 italic pl-0.5">staggered</div>
                              ) : (
                                <div className="space-y-1">
                                  {entries.map(e => {
                                    const tech = technicians.find(t => t.id === e.technician_id)
                                    if (!tech) return null
                                    return (
                                      <div key={e.id}
                                        className="flex items-center gap-1 px-2 py-1 rounded-md font-medium"
                                        style={{ background: group.lightBg, color: group.colour, border: `1px solid ${group.border}` }}>
                                        <span className="truncate">{tech.full_name.split(' ')[0]}</span>
                                        <button onClick={() => removeEntry(e.id)} disabled={saving}
                                          className="ml-auto shrink-0 opacity-40 hover:opacity-100 leading-none">×</button>
                                      </div>
                                    )
                                  })}
                                  <button
                                    onClick={() => setPopover({ dateStr: d.dateStr, slotKey: slot.key, tier: group.tier, groupKey: group.key })}
                                    className="w-full text-left px-2 py-1 rounded-md border border-dashed border-gray-200 text-gray-300 hover:border-gray-400 hover:text-gray-500 transition-colors">
                                    + Add
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4">
        {SHIFT_GROUPS.map(g => (
          <div key={g.key} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: g.colour }} />
            <span className="text-xs font-medium text-gray-700">{g.label}</span>
            <span className="text-xs text-gray-400">{g.hours}</span>
          </div>
        ))}
      </div>

      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPopover(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-72" onClick={e => e.stopPropagation()}>
            {(() => {
              const group    = SHIFT_GROUPS.find(g => g.key === popover.groupKey)!
              const slot     = ALL_SLOTS.find(s => s.key === popover.slotKey)!
              const day      = weekDates.find(d => d.dateStr === popover.dateStr)!
              const eligible = technicians.filter(t =>
                (t.support_tiers ?? []).includes(popover.tier) &&
                !isBusy(t.id, popover.dateStr) &&
                !hasShiftConflict(t.id, popover.dateStr, popover.groupKey)
              )
              return (
                <>
                  <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{group.label} — {slot.label}</h3>
                  <p className="text-xs text-gray-400 mb-4">{day.label} · {slot.hours}</p>
                  {eligible.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      No eligible technicians available.<br />
                      <span className="text-gray-300">Check support tier badges on technician profiles.</span>
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-auto">
                      {eligible.map(t => {
                        const assigned = isAssigned(t.id, popover.dateStr, popover.slotKey)
                        return (
                          <button key={t.id} onClick={() => toggle(t.id)} disabled={saving}
                            className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                              assigned ? 'text-white' : 'hover:bg-gray-50 text-gray-700 border border-gray-100'
                            }`}
                            style={assigned ? { background: group.colour } : {}}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                              style={{ background: assigned ? 'rgba(255,255,255,0.3)' : group.colour }}>
                              {t.initials}
                            </div>
                            <span className="font-medium">{t.full_name}</span>
                            {assigned && <span className="ml-auto text-xs opacity-70">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <button onClick={() => setPopover(null)}
                    className="mt-3 w-full py-2 rounded-lg text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-50">
                    Close
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
