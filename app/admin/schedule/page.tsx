'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const BRAND_GREEN = '#46DA26'

const VISIT_TYPES: {
  value: string
  label: string
  colour: string
  needsSchool: boolean
  isAbsence: boolean
}[] = [
  { value: 'technology_partner', label: 'TP Visit',     colour: '#C0392B', needsSchool: true,  isAbsence: false },
  { value: 'handover',           label: 'Handover',      colour: '#7A5C2E', needsSchool: true,  isAbsence: false },
  { value: 'shadow',             label: 'Shadow',        colour: '#3D6B5E', needsSchool: true,  isAbsence: false },
  { value: 'installation',       label: 'Installation',  colour: '#1D6FA4', needsSchool: true,  isAbsence: false },
  { value: 'phone_duty',         label: 'Phone duty',    colour: '#1A6FA8', needsSchool: false, isAbsence: false },
  { value: 'annual_leave',       label: 'Annual leave',  colour: '#94a3b8', needsSchool: false, isAbsence: true  },
  { value: 'sickness',           label: 'Sickness',      colour: '#ef4444', needsSchool: false, isAbsence: true  },
  { value: 'other_absence',      label: 'Other absence', colour: '#a78bfa', needsSchool: false, isAbsence: true  },
]

const DELETE_REASONS = [
  'Created in error',
  'Duplicate',
  'School closed',
  'Cancelled by school',
  'Other',
]

function getVisitTypeConfig(type: string) {
  return VISIT_TYPES.find(t => t.value === type) ?? { value: type, label: type, colour: '#6B6B6B', needsSchool: false, isAbsence: false }
}

function hatchStyle(colour: string) {
  return {
    background: `repeating-linear-gradient(45deg,${colour}55,${colour}55 4px,${colour}22 4px,${colour}22 10px)`,
    border: `1px solid ${colour}88`,
  }
}

interface Technician { id: string; full_name: string; initials: string; photo_url: string | null }
interface Visit {
  id: string; school_id: string | null; technician_id: string; visit_date: string
  slot: string; status: string; visit_type: string; travel_warning: boolean; notes: string | null
  schools: { id: string; name: string; short_name: string | null } | null
}
interface School { id: string; name: string; short_name: string | null }
interface SidebarVisit { id: string; school_id: string | null; school_name: string; visit_type: string; original_slot: string | null }
interface PendingChange { label: string; visitId: string; action: 'move' | 'bank'; newTechnicianId?: string; newDate?: string; newSlot?: string; newStatus?: string }
interface BankHoliday { holiday_date: string; name: string }
interface TermDate { start_date: string; end_date: string }

const SLOTS = ['am', 'pm']
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const ROW_COLOURS = [
  ['#fafafa','#f5f5f5'],['#f0f9ff','#e8f4fd'],['#fdf4ff','#faf0fe'],['#f0fdf4','#e8fdf0'],
  ['#fffbf0','#fef7e0'],['#fff0f0','#fde8e8'],['#f0f0ff','#e8e8fd'],['#f0ffff','#e0fafa'],
]

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function getWeekDates(offset: number) {
  const today = new Date()
  const monday = new Date(today)
  const dow = today.getDay()
  monday.setDate(today.getDate() + (dow === 0 ? 1 : 1 - dow) + offset * 7)
  const todayStr = toDateStr(today)
  return DAY_KEYS.map((key, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return { key, date, dateStr: toDateStr(date), label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), isToday: toDateStr(date) === todayStr }
  })
}

export default function WeeklyPlannerPage() {
  const supabase = createClient()
  const [weekOffset, setWeekOffset] = useState(0)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([])
  const [termDates, setTermDates] = useState<TermDate[]>([])
  const [sidebar, setSidebar] = useState<SidebarVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<PendingChange[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [overSlot, setOverSlot] = useState<string | null>(null)
  const [overSidebar, setOverSidebar] = useState(false)

  // Popover
  const [popover, setPopover] = useState<{ techId: string; techName: string; dateStr: string; slot: string } | null>(null)
  const [popVisitType, setPopVisitType] = useState('annual_leave')
  const [popSchoolId, setPopSchoolId] = useState('')
  const [popNotes, setPopNotes] = useState('')
  const [popSchoolSearch, setPopSchoolSearch] = useState('')
  const [savingPop, setSavingPop] = useState(false)
  const [popAddToBank, setPopAddToBank] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Visit | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteNotes, setDeleteNotes] = useState('')
  const [deleting, setDeleting] = useState(false)

  const drag = useRef<{ source: 'grid' | 'sidebar'; visitId?: string; sidebarItem?: SidebarVisit } | null>(null)
  const weekDates = getWeekDates(weekOffset)

  // ── Load ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      const weekStart = weekDates[0].dateStr
      const weekEnd   = weekDates[4].dateStr
      const [
        { data: techs }, { data: weekVisits }, { data: bankedVisits },
        { data: holidays }, { data: terms }, { data: schoolList },
      ] = await Promise.all([
        supabase.from('technicians').select('id, full_name, initials, photo_url').eq('is_active', true).order('full_name'),
        supabase.from('visits').select(`id, school_id, technician_id, visit_date, slot, status, visit_type, travel_warning, notes, schools (id, name, short_name)`).not('status','in','("banked","completed")').gte('visit_date', weekStart).lte('visit_date', weekEnd),
        supabase.from('visits').select(`id, school_id, visit_type, slot, schools (id, name, short_name)`).eq('status', 'banked'),
        supabase.from('bank_holidays').select('holiday_date, name'),
        supabase.from('term_dates').select('start_date, end_date'),
        supabase.from('schools').select('id, name, short_name').eq('is_active', true).order('name'),
      ])
      setTechnicians(techs ?? [])
      setVisits(weekVisits ?? [])
      setBankHolidays(holidays ?? [])
      setTermDates(terms ?? [])
      setSchools(schoolList ?? [])
      setSidebar((bankedVisits ?? []).map((v: { id: string; school_id: string | null; visit_type: string; slot: string; schools: { id: string; name: string; short_name: string | null } | null }) => ({
        id: v.id, school_id: v.school_id,
        school_name: v.schools?.short_name || v.schools?.name || 'No school',
        visit_type: v.visit_type, original_slot: v.slot,
      })))
      setLoading(false)
    }
    load()
  }, [weekOffset])

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function isBankHoliday(dateStr: string): BankHoliday | null { return bankHolidays.find(h => h.holiday_date === dateStr) ?? null }
  function isInTerm(dateStr: string): boolean { return termDates.some(t => dateStr >= t.start_date && dateStr <= t.end_date) }
  function getVisit(techId: string, dateStr: string, slot: string): Visit | null { return visits.find(v => v.technician_id === techId && v.visit_date === dateStr && v.slot === slot) ?? null }
  function getFullDayMerge(techId: string, dateStr: string): string | null {
    const am = getVisit(techId, dateStr, 'am')
    const pm = getVisit(techId, dateStr, 'pm')
    if (am && pm && am.visit_type === pm.visit_type && am.school_id === pm.school_id) return am.visit_type
    return null
  }
  function isSlotFree(techId: string, dateStr: string, slot: string): boolean { return !getVisit(techId, dateStr, slot) }

  // ── Drag ──────────────────────────────────────────────────────────────────────

  function onDragStartGrid(visit: Visit) { drag.current = { source: 'grid', visitId: visit.id } }
  function onDragStartSidebar(item: SidebarVisit) { drag.current = { source: 'sidebar', sidebarItem: item } }

  function onDragOver(e: React.DragEvent, techId: string, dateStr: string, slot: string) {
    e.preventDefault()
    if (isSlotFree(techId, dateStr, slot)) { setOverSlot(`${techId}-${dateStr}-${slot}`); setOverSidebar(false) }
  }

  function onDrop(e: React.DragEvent, targetTech: string, targetDate: string, targetSlot: string) {
    e.preventDefault(); setOverSlot(null)
    if (!drag.current || !isSlotFree(targetTech, targetDate, targetSlot)) return
    if (drag.current.source === 'grid' && drag.current.visitId) {
      const visitId = drag.current.visitId
      const visit = visits.find(v => v.id === visitId)
      if (!visit || (visit.technician_id === targetTech && visit.visit_date === targetDate && visit.slot === targetSlot)) return
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, technician_id: targetTech, visit_date: targetDate, slot: targetSlot } : v))
      setPending(prev => [...prev, { label: `${visit.schools?.short_name || visit.schools?.name || getVisitTypeConfig(visit.visit_type).label}: → ${targetDate} ${targetSlot.toUpperCase()}`, visitId, action: 'move', newTechnicianId: targetTech, newDate: targetDate, newSlot: targetSlot }])
    } else if (drag.current.source === 'sidebar' && drag.current.sidebarItem) {
      const item = drag.current.sidebarItem
      setVisits(prev => [...prev, { id: item.id, school_id: item.school_id, technician_id: targetTech, visit_date: targetDate, slot: targetSlot, status: 'confirmed', visit_type: item.visit_type, travel_warning: false, notes: null, schools: item.school_id ? { id: item.school_id, name: item.school_name, short_name: null } : null }])
      setSidebar(prev => prev.filter(s => s.id !== item.id))
      setPending(prev => [...prev, { label: `${item.school_name}: scheduled ${targetDate} ${targetSlot.toUpperCase()}`, visitId: item.id, action: 'move', newTechnicianId: targetTech, newDate: targetDate, newSlot: targetSlot, newStatus: 'confirmed' }])
    }
    drag.current = null
  }

  function onSidebarDragOver(e: React.DragEvent) { e.preventDefault(); setOverSidebar(true); setOverSlot(null) }

  function onSidebarDrop(e: React.DragEvent) {
    e.preventDefault(); setOverSidebar(false)
    if (!drag.current || drag.current.source !== 'grid' || !drag.current.visitId) return
    const visit = visits.find(v => v.id === drag.current!.visitId)
    if (!visit) return
    const cfg = getVisitTypeConfig(visit.visit_type)
    if (cfg.isAbsence) return
    setSidebar(prev => [...prev, { id: visit.id, school_id: visit.school_id, school_name: visit.schools?.short_name || visit.schools?.name || 'Unknown', visit_type: visit.visit_type, original_slot: visit.slot }])
    setVisits(prev => prev.filter(v => v.id !== drag.current!.visitId))
    setPending(prev => [...prev, { label: `${visit.schools?.short_name || visit.schools?.name}: banked`, visitId: visit.id, action: 'bank' }])
    drag.current = null
  }

  // ── Popover ───────────────────────────────────────────────────────────────────

  function openPopover(techId: string, techName: string, dateStr: string, slot: string) {
    setPopover({ techId, techName, dateStr, slot })
    setPopVisitType('annual_leave'); setPopSchoolId(''); setPopNotes(''); setPopSchoolSearch('')
    setPopAddToBank(false)
  }

async function savePopover() {
  if (!popover) return
  const cfg = getVisitTypeConfig(popVisitType)
  if (cfg.needsSchool && !popSchoolId) return
  setSavingPop(true)

  const { data: newVisit, error } = await supabase
    .from('visits')
    .insert({
      technician_id: popover.techId,
      visit_date:    popover.dateStr,
      slot:          popover.slot,
      visit_type:    popVisitType,
      school_id:     cfg.needsSchool ? popSchoolId : null,
      status:        popAddToBank ? 'banked' : 'confirmed',
      banked_at:     popAddToBank ? new Date().toISOString() : null,
      notes:         popNotes.trim() || null,
    })
    .select(`id, school_id, technician_id, visit_date, slot, status, visit_type, travel_warning, notes, schools (id, name, short_name)`)
    .single()

  if (!error && newVisit) {
    if (popAddToBank) {
      // Add to sidebar bank
      const school = schools.find(s => s.id === popSchoolId)
      setSidebar(prev => [...prev, {
        id:            newVisit.id,
        school_id:     newVisit.school_id,
        school_name:   school?.short_name || school?.name || 'No school',
        visit_type:    newVisit.visit_type,
        original_slot: newVisit.slot,
      }])
    } else {
      // Refresh grid visits
      const { data: refreshed } = await supabase
        .from('visits')
        .select(`id, school_id, technician_id, visit_date, slot, status, visit_type, travel_warning, notes, schools (id, name, short_name)`)
        .not('status', 'in', '("banked","completed")')
        .gte('visit_date', weekDates[0].dateStr)
        .lte('visit_date', weekDates[4].dateStr)
      setVisits(refreshed ?? [])
    }
  }
  setSavingPop(false)
  setPopover(null)
}

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget || !deleteReason) return
    setDeleting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const pairedSlot = deleteTarget.slot === 'am' ? 'pm' : 'am'
    const paired = visits.find(v => v.technician_id === deleteTarget.technician_id && v.visit_date === deleteTarget.visit_date && v.slot === pairedSlot && v.visit_type === deleteTarget.visit_type && v.school_id === deleteTarget.school_id)
    const toDelete = [deleteTarget, ...(paired ? [paired] : [])]
    const fullReason = deleteNotes.trim() ? `${deleteReason} — ${deleteNotes.trim()}` : deleteReason
    for (const v of toDelete) {
      await supabase.from('visit_deletions').insert({ visit_date: v.visit_date, school_id: v.school_id, technician_id: v.technician_id, slot: v.slot, visit_type: v.visit_type, reason: fullReason, deleted_by: user?.id ?? null })
      await supabase.from('visits').delete().eq('id', v.id)
    }
    setVisits(prev => prev.filter(v => !toDelete.map(d => d.id).includes(v.id)))
    setDeleting(false); setDeleteTarget(null)
  }

  // ── Confirm ───────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (pending.length === 0) return
    setSaving(true)
    for (const change of pending) {
      if (change.action === 'move') await supabase.from('visits').update({ technician_id: change.newTechnicianId, visit_date: change.newDate, slot: change.newSlot, status: change.newStatus ?? 'confirmed', ...(change.newStatus === 'confirmed' ? { banked_at: null } : {}) }).eq('id', change.visitId)
      else if (change.action === 'bank') await supabase.from('visits').update({ status: 'banked', banked_at: new Date().toISOString() }).eq('id', change.visitId)
    }
    setSaving(false); setSaved(true); setPending([])
    setTimeout(() => setSaved(false), 3000)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const weekLabel = `${weekDates[0].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${weekDates[4].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const filteredSchools = schools.filter(s => !popSchoolSearch || s.name.toLowerCase().includes(popSchoolSearch.toLowerCase()) || s.short_name?.toLowerCase().includes(popSchoolSearch.toLowerCase()))

  if (loading) return <div className="flex items-center justify-center py-20"><p className="text-sm text-gray-400">Loading planner...</p></div>

  return (
    <div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Weekly Planner</h1>
          <p className="text-xs text-gray-400 mt-0.5">Drag to rearrange · Drag to sidebar to bank · Click empty slot to add</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">‹</button>
            <span className="text-xs font-medium text-gray-700 w-48 text-center">{weekLabel}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">›</button>
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded border border-gray-200">Today</button>}
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && <span className="text-xs text-amber-600">{pending.length} unsaved</span>}
            <button onClick={handleConfirm} disabled={pending.length === 0 || saving}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-30"
              style={{ background: BRAND_GREEN }}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : `Confirm${pending.length > 0 ? ` (${pending.length})` : ''}`}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-3">

        {/* Grid — horizontally scrollable */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="border-collapse text-xs" style={{ minWidth: 700 }}>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-3 py-2.5 font-medium text-gray-500 border-r border-gray-100 sticky left-0 bg-gray-50 z-10" style={{ minWidth: 120 }}>Technician</th>
                <th className="px-2 py-2.5 text-gray-400 font-normal text-center border-r border-gray-100" style={{ minWidth: 44 }}>Slot</th>
                {weekDates.map(d => {
                  const bh = isBankHoliday(d.dateStr)
                  const inTerm = isInTerm(d.dateStr)
                  return (
                    <th key={d.key} className="px-2 py-2 font-medium text-center border-r border-gray-100 last:border-r-0" style={{ minWidth: 130, background: d.isToday ? BRAND_GREEN : bh ? '#fee2e2' : !inTerm ? '#f1f5f9' : undefined, color: d.isToday ? 'white' : bh ? '#991b1b' : !inTerm ? '#94a3b8' : '#374151' }}>
                      <div>{d.label}</div>
                      {bh && <div className="text-xs font-normal opacity-75 mt-0.5 truncate">{bh.name}</div>}
                      {!bh && !inTerm && <div className="text-xs font-normal opacity-60 mt-0.5">Holiday</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {technicians.map((tech, ti) => {
                const [amBg, pmBg] = ROW_COLOURS[ti % ROW_COLOURS.length]
                return SLOTS.map((slot, si) => (
                  <tr key={`${tech.id}-${slot}`} className="border-b border-gray-100 last:border-b-0" style={{ background: slot === 'am' ? amBg : pmBg }}>

                    {/* Tech label — sticky, clickable, AM row only */}
                    {si === 0 ? (
                      <td rowSpan={2} className="px-3 py-2 border-r border-gray-100 align-middle sticky left-0 z-10" style={{ background: amBg }}>
                        <Link href={`/admin/technicians/${tech.id}`} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
                          {tech.photo_url ? (
                            <img src={tech.photo_url} alt={tech.full_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: BRAND_GREEN }}>{tech.initials}</div>
                          )}
                          <span className="font-semibold text-gray-800 truncate text-xs">{tech.full_name.split(' ')[0]}</span>
                        </Link>
                      </td>
                    ) : null}

                    {/* Slot badge */}
                    <td className="px-1 py-1 text-center border-r border-gray-100" style={{ background: slot === 'am' ? amBg : pmBg }}>
                      <span className={`text-xs font-medium px-1 py-0.5 rounded ${slot === 'am' ? 'text-blue-600 bg-blue-100' : 'text-orange-600 bg-orange-100'}`}>{slot.toUpperCase()}</span>
                    </td>

                    {/* Day cells */}
                    {weekDates.map(d => {
                      const visit = getVisit(tech.id, d.dateStr, slot)
                      const mergeType = slot === 'am' ? getFullDayMerge(tech.id, d.dateStr) : null
                      const isBottomOfMerge = slot === 'pm' && getFullDayMerge(tech.id, d.dateStr) !== null
                      const slotKey = `${tech.id}-${d.dateStr}-${slot}`
                      const isOver = overSlot === slotKey
                      const bh = isBankHoliday(d.dateStr)
                      const inTerm = isInTerm(d.dateStr)
                      const todayStr = weekDates.find(w => w.isToday)?.dateStr ?? ''
                      const isPast = d.dateStr < todayStr && !d.isToday
                      const cellBg = bh ? '#fef2f2' : !inTerm ? '#f8fafc' : slot === 'am' ? amBg : pmBg
                      const cfg = visit ? getVisitTypeConfig(visit.visit_type) : null

                      if (isBottomOfMerge) return <td key={d.key} className="border-r border-gray-100 last:border-r-0" style={{ background: cellBg }} />

                      return (
                        <td key={d.key} className="px-1 py-1 border-r border-gray-100 last:border-r-0" style={{ minWidth: 130, background: cellBg, opacity: isPast ? 0.6 : 1 }} rowSpan={mergeType ? 2 : 1}>

                          {(bh || !inTerm) && !visit ? (
                            <div className="rounded text-xs flex items-center justify-center" style={{ minHeight: mergeType ? 62 : 30, background: bh ? '#fee2e220' : '#f1f5f920', border: `1px solid ${bh ? '#fca5a5' : '#cbd5e1'}`, color: bh ? '#b91c1c' : '#94a3b8' }}>
                              {bh ? '🏦' : '🏖️'}
                            </div>
                          ) : visit ? (
                            <div
                              draggable={!cfg?.isAbsence}
                              onDragStart={() => !cfg?.isAbsence && onDragStartGrid(visit)}
                              className={`rounded text-xs font-medium flex items-center justify-between gap-1 px-1.5 py-1 select-none ${!cfg?.isAbsence ? 'cursor-grab active:cursor-grabbing' : ''} ${visit.status === 'completed' ? 'opacity-60' : ''}`}
                              style={{ minHeight: mergeType ? 62 : 30, ...(cfg?.isAbsence ? { ...hatchStyle(cfg.colour), color: cfg.colour } : { background: cfg?.colour ?? '#C0392B', color: 'white' }) }}
                              title={visit.schools?.name ?? cfg?.label ?? ''}
                            >
                              <span className="truncate">
                                {cfg?.isAbsence ? cfg.label : visit.visit_type === 'phone_duty' ? '📞 Phone duty' : visit.schools?.short_name || visit.schools?.name?.split(' ')[0]}
                              </span>
                              <div className="flex items-center gap-0.5 shrink-0">
                                {visit.travel_warning && <span className="text-yellow-300">⚠</span>}
                                {visit.status === 'completed' && <span>✓</span>}
                                <button onClick={() => { setDeleteTarget(visit); setDeleteReason(''); setDeleteNotes('') }} className="opacity-40 hover:opacity-100 ml-0.5 text-xs" title="Delete">✕</button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onDragOver={e => onDragOver(e, tech.id, d.dateStr, slot)}
                              onDrop={e => onDrop(e, tech.id, d.dateStr, slot)}
                              onDragLeave={() => setOverSlot(null)}
                              onClick={() => openPopover(tech.id, tech.full_name, d.dateStr, slot)}
                              className="rounded border-2 border-dashed flex items-center justify-center cursor-pointer group transition-colors"
                              style={{ borderColor: isOver ? BRAND_GREEN : '#e2e8f0', background: isOver ? '#f0fdf4' : 'transparent', minHeight: 30 }}>
                              <span className="opacity-0 group-hover:opacity-50 text-gray-400 text-xs select-none">+ add</span>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              })}
            </tbody>
          </table>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 border-t border-gray-100 bg-gray-50">
            {VISIT_TYPES.filter(t => !t.isAbsence).map(t => (
              <div key={t.value} className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded-sm" style={{ background: t.colour }} />{t.label}</div>
            ))}
            <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded-sm border border-gray-300" style={{ background: 'repeating-linear-gradient(45deg,#94a3b8,#94a3b8 2px,transparent 2px,transparent 5px)' }} />Absence</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">🏦 Bank holiday</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">🏖️ Holiday</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">✓ Completed</div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-52 shrink-0 bg-white rounded-xl border border-gray-100 flex flex-col text-xs"
          onDragOver={onSidebarDragOver} onDrop={onSidebarDrop} onDragLeave={() => setOverSidebar(false)}>
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-700">Visit bank</p>
            <p className="text-gray-400 mt-0.5">{sidebar.length} visit{sidebar.length !== 1 ? 's' : ''} to place</p>
          </div>
          <div className="mx-3 mt-2 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors"
            style={{ minHeight: 40, borderColor: overSidebar ? BRAND_GREEN : '#e2e8f0', background: overSidebar ? '#f0fdf4' : 'transparent', color: overSidebar ? BRAND_GREEN : '#9ca3af' }}>
            <span className="text-xs px-2 text-center">{overSidebar ? 'Drop to bank' : 'Drag here to bank'}</span>
          </div>
          <div className="px-3 py-3 space-y-2 flex-1 overflow-auto">
            {sidebar.length === 0
              ? <p className="text-gray-400 text-center py-4">All placed ✓</p>
              : sidebar.map(item => {
                const cfg = getVisitTypeConfig(item.visit_type)
                return (
                  <div key={item.id} draggable onDragStart={() => onDragStartSidebar(item)}
                    className="rounded-md px-3 py-2 text-white font-medium cursor-grab select-none"
                    style={{ background: cfg.colour }}>
                    <div className="truncate">{item.school_name}</div>
                    <div className="text-white/70 mt-0.5 text-xs">{cfg.label}</div>
                  </div>
                )
              })
            }
          </div>
          {pending.length > 0 && (
            <div className="px-3 py-3 border-t border-gray-100">
              <p className="font-semibold text-gray-700 mb-2">Pending ({pending.length})</p>
              <div className="space-y-1 max-h-32 overflow-auto">
                {pending.map((c, i) => <p key={i} className="text-gray-500 leading-snug">{c.label}</p>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slot popover */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPopover(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Add to slot</h3>
            <p className="text-xs text-gray-500 mb-4">
              {popover.techName} · {new Date(popover.dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {popover.slot.toUpperCase()}
            </p>
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-700 mb-2">Type</p>
              <div className="grid grid-cols-2 gap-1.5">
                {VISIT_TYPES.map(t => (
                  <label key={t.value} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition-colors ${popVisitType === t.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <input type="radio" name="visittype" value={t.value} checked={popVisitType === t.value} onChange={() => { setPopVisitType(t.value); setPopSchoolId(''); setPopSchoolSearch('') }} className="sr-only" />
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: t.colour }} />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            {getVisitTypeConfig(popVisitType).needsSchool && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-700 mb-1">School <span className="text-red-500">*</span></p>
                <input type="text" value={popSchoolSearch} onChange={e => setPopSchoolSearch(e.target.value)} placeholder="Search schools..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 mb-1" />
                <div className="max-h-32 overflow-auto border border-gray-100 rounded-lg">
                  {filteredSchools.slice(0, 8).map(s => (
                    <button key={s.id} onClick={() => { setPopSchoolId(s.id); setPopSchoolSearch(s.short_name || s.name) }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${popSchoolId === s.id ? 'bg-gray-100 font-medium' : ''}`}>
                      {s.name}{s.short_name && <span className="text-gray-400 ml-1">({s.short_name})</span>}
                    </button>
                  ))}
                  {filteredSchools.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No schools found</p>}
                </div>
              </div>
            )}
            {/* Add to bank toggle */}
<div className="mb-4">
  <label className="flex items-center gap-2.5 cursor-pointer">
    <input
      type="checkbox"
      checked={popAddToBank}
      onChange={e => setPopAddToBank(e.target.checked)}
      className="accent-gray-900"
    />
    <div>
      <p className="text-xs font-medium text-gray-700">Add to visit bank</p>
      <p className="text-xs text-gray-400 mt-0.5">Place in the sidebar to schedule later via the planner</p>
    </div>
  </label>
</div>
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></p>
              <input type="text" value={popNotes} onChange={e => setPopNotes(e.target.value)} placeholder="Any additional notes..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="flex gap-2">
              <button onClick={savePopover} disabled={savingPop || (getVisitTypeConfig(popVisitType).needsSchool && !popSchoolId)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: BRAND_GREEN }}>
                {savingPop ? 'Saving…' : popAddToBank ? 'Add to bank' : 'Add to slot'}
              </button>
              <button onClick={() => setPopover(null)} className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDeleteTarget(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Delete visit</h3>
            <p className="text-xs text-gray-500 mb-4">
              {getVisitTypeConfig(deleteTarget.visit_type).label}
              {deleteTarget.schools ? ` — ${deleteTarget.schools.name}` : ''}
              {' · '}{new Date(deleteTarget.visit_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              {' · '}{deleteTarget.slot.toUpperCase()}
              {getFullDayMerge(deleteTarget.technician_id, deleteTarget.visit_date) ? ' · full day (both slots)' : ''}
            </p>
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></p>
              <select value={deleteReason} onChange={e => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">Select a reason...</option>
                {DELETE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></p>
              <input type="text" value={deleteNotes} onChange={e => setDeleteNotes(e.target.value)} placeholder="Any additional detail..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleting || !deleteReason}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}