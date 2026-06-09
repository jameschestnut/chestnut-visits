'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const SHIFTS = [
  {
    key:         'first_line_early',
    label:       '1st Line — Early',
    hours:       '08:00–16:30',
    lunch:       'Lunch 12:30–13:00',
    phoneHours:  'Phones 08:30–16:30',
    colour:      '#1E40AF',
    lightBg:     '#eff6ff',
    border:      '#bfdbfe',
  },
  {
    key:         'first_line_late',
    label:       '1st Line — Late',
    hours:       '09:00–17:30',
    lunch:       'Lunch 13:00–13:30',
    phoneHours:  'Phones 09:00–17:00',
    colour:      '#065F46',
    lightBg:     '#f0fdf9',
    border:      '#a7f3d0',
  },
  {
    key:         'second_line',
    label:       '2nd Line',
    hours:       '08:30–17:00',
    lunch:       'Lunch 12:30–13:00',
    phoneHours:  'Escalations',
    colour:      '#92400E',
    lightBg:     '#fffbeb',
    border:      '#fde68a',
  },
]

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
  technician_id: string | null
  notes: string | null
}

interface Technician {
  id: string
  full_name: string
  initials: string
  photo_url: string | null
}

interface Popover {
  dateStr: string
  shiftKey: string
  currentTechId: string | null
  entryId: string | null
}

export default function SupportRotaPage() {
  const supabase = createClient()

  const [weekOffset, setWeekOffset] = useState(0)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [rota, setRota]               = useState<RotaEntry[]>([])
  const [loading, setLoading]         = useState(true)
  const [popover, setPopover]         = useState<Popover | null>(null)
  const [saving, setSaving]           = useState(false)

  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0].dateStr
  const weekEnd   = weekDates[4].dateStr

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: techs }, { data: rotaData }] = await Promise.all([
        supabase.from('technicians')
          .select('id, full_name, initials, photo_url')
          .eq('is_active', true)
          .order('full_name'),
        supabase.from('support_rota')
          .select('id, rota_date, shift_type, technician_id, notes')
          .gte('rota_date', weekStart)
          .lte('rota_date', weekEnd),
      ])
      setTechnicians(techs ?? [])
      setRota(rotaData ?? [])
      setLoading(false)
    }
    load()
  }, [weekOffset])

  function getEntry(dateStr: string, shiftKey: string): RotaEntry | undefined {
    return rota.find(r => r.rota_date === dateStr && r.shift_type === shiftKey)
  }

  function getTech(id: string | null | undefined): Technician | undefined {
    return id ? technicians.find(t => t.id === id) : undefined
  }

  async function assign(techId: string | null) {
    if (!popover) return
    setSaving(true)
    const { dateStr, shiftKey, entryId } = popover

    if (entryId) {
      if (techId === null) {
        await supabase.from('support_rota').delete().eq('id', entryId)
        setRota(prev => prev.filter(r => r.id !== entryId))
      } else {
        await supabase.from('support_rota').update({ technician_id: techId }).eq('id', entryId)
        setRota(prev => prev.map(r => r.id === entryId ? { ...r, technician_id: techId } : r))
      }
    } else if (techId !== null) {
      const { data } = await supabase.from('support_rota')
        .insert({ rota_date: dateStr, shift_type: shiftKey, technician_id: techId })
        .select()
        .single()
      if (data) setRota(prev => [...prev, data])
    }

    setSaving(false)
    setPopover(null)
  }

  // Coverage summary for the week
  const gaps = weekDates.flatMap(d =>
    SHIFTS.filter(s => !getEntry(d.dateStr, s.key)?.technician_id).map(s => ({ date: d.label, shift: s.label }))
  )

  const weekLabel = `${weekDates[0].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${weekDates[4].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div>
      {/* Header */}
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

      {/* Coverage gaps banner */}
      {!loading && gaps.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2">
          <span className="text-amber-500 text-sm mt-0.5">⚠</span>
          <div>
            <p className="text-xs font-medium text-amber-800">{gaps.length} unassigned slot{gaps.length !== 1 ? 's' : ''} this week</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {gaps.slice(0, 4).map(g => `${g.date} – ${g.shift}`).join(' · ')}
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
          <table className="border-collapse text-xs" style={{ minWidth: 640, width: '100%' }}>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 border-r border-gray-100" style={{ minWidth: 160, width: 160 }}>
                  Shift
                </th>
                {weekDates.map(d => (
                  <th key={d.key} className="px-2 py-3 font-medium text-center border-r border-gray-100 last:border-r-0"
                    style={{ width: 130, minWidth: 130 }}>
                    <span className={d.isToday ? 'text-white px-2 py-0.5 rounded-full text-xs' : 'text-gray-500 text-xs'}
                      style={d.isToday ? { background: '#46DA26' } : {}}>
                      {d.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map(shift => (
                <tr key={shift.key} className="border-b border-gray-100 last:border-b-0">
                  {/* Shift label */}
                  <td className="px-4 py-3 border-r border-gray-100 align-top">
                    <div className="font-medium text-gray-700 text-xs">{shift.label}</div>
                    <div className="text-gray-400 text-xs mt-0.5">{shift.hours}</div>
                    <div className="text-gray-300 text-xs mt-0.5">{shift.lunch}</div>
                  </td>

                  {/* Day cells */}
                  {weekDates.map(d => {
                    const entry = getEntry(d.dateStr, shift.key)
                    const tech  = getTech(entry?.technician_id)
                    const assigned = !!tech

                    return (
                      <td key={d.key} className="px-2 py-2 border-r border-gray-100 last:border-r-0 align-top">
                        <button
                          onClick={() => setPopover({
                            dateStr:       d.dateStr,
                            shiftKey:      shift.key,
                            currentTechId: entry?.technician_id ?? null,
                            entryId:       entry?.id ?? null,
                          })}
                          className={`w-full text-left rounded-lg px-2.5 py-2 border transition-colors ${
                            assigned
                              ? 'hover:opacity-80'
                              : 'border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                          }`}
                          style={assigned ? { background: shift.lightBg, borderColor: shift.border } : {}}>
                          {assigned ? (
                            <>
                              <div className="font-medium text-xs truncate" style={{ color: shift.colour }}>
                                {tech!.full_name.split(' ')[0]} {tech!.full_name.split(' ').slice(-1)[0]}
                              </div>
                              <div className="text-xs mt-0.5" style={{ color: shift.colour + '99' }}>
                                {tech!.initials}
                              </div>
                            </>
                          ) : (
                            <span className="text-gray-300 text-xs">Assign…</span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Shift legend */}
      <div className="mt-4 flex flex-wrap gap-4">
        {SHIFTS.map(s => (
          <div key={s.key} className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: s.colour }} />
            <div>
              <p className="text-xs font-medium text-gray-700">{s.label}</p>
              <p className="text-xs text-gray-400">{s.hours} · {s.lunch}</p>
              <p className="text-xs text-gray-300">{s.phoneHours}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Assign popover */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPopover(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-72" onClick={e => e.stopPropagation()}>
            {(() => {
              const shift = SHIFTS.find(s => s.key === popover.shiftKey)!
              const day   = weekDates.find(d => d.dateStr === popover.dateStr)!
              return (
                <>
                  <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{shift.label}</h3>
                  <p className="text-xs text-gray-400 mb-4">{day.label} · {shift.hours}</p>

                  <div className="space-y-1.5 max-h-64 overflow-auto">
                    {technicians.map(t => (
                      <button key={t.id} onClick={() => assign(t.id)} disabled={saving}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          t.id === popover.currentTechId
                            ? 'text-white'
                            : 'hover:bg-gray-50 text-gray-700 border border-gray-100'
                        }`}
                        style={t.id === popover.currentTechId ? { background: shift.colour } : {}}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                          style={{ background: t.id === popover.currentTechId ? 'rgba(255,255,255,0.3)' : shift.colour }}>
                          {t.initials}
                        </div>
                        <span className="font-medium">{t.full_name}</span>
                        {t.id === popover.currentTechId && <span className="ml-auto text-xs opacity-70">✓</span>}
                      </button>
                    ))}
                  </div>

                  {popover.currentTechId && (
                    <button onClick={() => assign(null)} disabled={saving}
                      className="mt-3 w-full py-2 rounded-lg text-xs font-medium text-red-600 border border-red-100 hover:bg-red-50">
                      Remove assignment
                    </button>
                  )}

                  <button onClick={() => setPopover(null)}
                    className="mt-2 w-full py-2 rounded-lg text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-50">
                    Cancel
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
