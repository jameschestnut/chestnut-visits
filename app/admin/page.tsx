import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'

const VISIT_COLOURS: Record<string, string> = {
  technology_partner: '#C0392B',
  phone_duty:         '#1A6FA8',
  installation:       '#1D6FA4',
  handover:           '#7A5C2E',
  shadow:             '#3D6B5E',
  annual_leave:       '#94a3b8',
  sickness:           '#ef4444',
  other_absence:      '#a78bfa',
}

const VISIT_LABELS: Record<string, string> = {
  technology_partner: 'TP Visit',
  phone_duty:         'Phone duty',
  installation:       'Installation',
  handover:           'Handover',
  shadow:             'Shadow',
  annual_leave:       'Annual leave',
  sickness:           'Sickness',
  other_absence:      'Other absence',
}

const ABSENCE_TYPES = new Set(['annual_leave', 'sickness', 'other_absence'])

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addWorkingDays(date: Date, days: number): Date {
  const d = new Date(date)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return d
}

function dayLabel(dateStr: string, today: Date): string {
  const date   = new Date(dateStr + 'T12:00:00')
  const diff   = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 6) return date.toLocaleDateString('en-GB', { weekday: 'long' })
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function hatchStyle(colour: string) {
  return `repeating-linear-gradient(45deg,${colour}55,${colour}55 3px,${colour}22 3px,${colour}22 8px)`
}

export default async function AdminDashboard() {
  const supabase = await createServiceSupabaseClient()
  const today    = new Date()
  const todayStr = toDateStr(today)

  // Next 7 days for milestones
  const in7Days  = new Date(today)
  in7Days.setDate(today.getDate() + 7)
  const in7Str   = toDateStr(in7Days)

  // In 60 days for DBS
  const in60Str  = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: technicians },
    { data: todayVisits },
    { data: disrupted },
    { data: banked },
    { data: lowFeedback },
    { data: dbsExpiring },
    { data: allTechs },
  ] = await Promise.all([
    // Active technicians for today's grid
    supabase.from('technicians').select('id, full_name, initials, photo_url').eq('is_active', true).order('full_name'),

    // Today's visits (all types including absences)
    supabase.from('visits')
      .select('id, technician_id, slot, status, visit_type, travel_warning, notes, schools (id, name, short_name)')
      .not('status', 'in', '("banked")')
      .eq('visit_date', todayStr),

    // Disrupted visits
    supabase.from('visits')
      .select('id, visit_date, slot, schools (id, name, short_name), technicians (id, full_name)')
      .eq('status', 'disrupted')
      .order('visit_date'),

    // Banked visits
    supabase.from('visits')
      .select('id, visit_date, banked_at, schools (id, name, short_name)')
      .eq('status', 'banked')
      .order('banked_at'),

    // Low feedback
    supabase.from('visit_feedback')
      .select('id, rating, submitted_at, visits (visit_date, schools (id, name))')
      .lte('rating', 2)
      .eq('needs_followup', true)
      .is('followup_dismissed_at', null)
      .not('submitted_at', 'is', null),

    // DBS expiring within 60 days
    supabase.from('technicians')
      .select('id, full_name, dbs_expiry_date')
      .eq('is_active', true)
      .not('dbs_expiry_date', 'is', null)
      .lte('dbs_expiry_date', in60Str),

    // All active technicians for milestones (birthdays + anniversaries)
    supabase.from('technicians')
      .select('id, full_name, date_of_birth, start_date')
      .eq('is_active', true),
  ])

  // ── Overdue banked visits ──────────────────────────────────────────────────

  const overdueBanked = (banked ?? []).filter((v: { banked_at: string | null }) => {
    if (!v.banked_at) return false
    return today >= addWorkingDays(new Date(v.banked_at), 5)
  })

  // ── Milestones — birthdays and work anniversaries in next 7 days ──────────

  interface Milestone { type: 'birthday' | 'anniversary'; techId: string; name: string; dateStr: string; years?: number }
  const milestones: Milestone[] = []

  for (const tech of (allTechs ?? [])) {
    // Birthdays
    if (tech.date_of_birth) {
      const dob       = new Date(tech.date_of_birth + 'T12:00:00')
      const thisYear  = new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
      const nextYear  = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate())
      const upcoming  = thisYear >= today ? thisYear : nextYear
      const upcomingStr = toDateStr(upcoming)
      if (upcomingStr <= in7Str) {
        milestones.push({ type: 'birthday', techId: tech.id, name: tech.full_name.split(' ')[0], dateStr: upcomingStr })
      }
    }

    // Work anniversaries
    if (tech.start_date) {
      const start     = new Date(tech.start_date + 'T12:00:00')
      const thisYear  = new Date(today.getFullYear(), start.getMonth(), start.getDate())
      const nextYear  = new Date(today.getFullYear() + 1, start.getMonth(), start.getDate())
      const upcoming  = thisYear >= today ? thisYear : nextYear
      const upcomingStr = toDateStr(upcoming)
      const years     = upcoming.getFullYear() - start.getFullYear()
      if (upcomingStr <= in7Str && years > 0) {
        milestones.push({ type: 'anniversary', techId: tech.id, name: tech.full_name.split(' ')[0], dateStr: upcomingStr, years })
      }
    }
  }

  milestones.sort((a, b) => a.dateStr.localeCompare(b.dateStr))

  const actionCount = (disrupted?.length ?? 0) + overdueBanked.length + (lowFeedback?.length ?? 0) + (dbsExpiring?.length ?? 0)

  return (
    <div className="max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {actionCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-medium text-amber-700">
              {actionCount} item{actionCount !== 1 ? 's' : ''} need attention
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* Today's schedule — 2 cols */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Today's schedule</h2>
            </div>

            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-2 font-medium text-gray-400 w-32">Technician</th>
                  <th className="px-3 py-2 font-medium text-blue-600 bg-blue-50/50 text-center w-1/2">AM</th>
                  <th className="px-3 py-2 font-medium text-orange-600 bg-orange-50/50 text-center w-1/2">PM</th>
                </tr>
              </thead>
              <tbody>
                {(technicians ?? []).map((tech, ti) => {
                  const amVisit = (todayVisits ?? []).find((v: { technician_id: string; slot: string }) => v.technician_id === tech.id && v.slot === 'am')
                  const pmVisit = (todayVisits ?? []).find((v: { technician_id: string; slot: string }) => v.technician_id === tech.id && v.slot === 'pm')
                  const bgAlt   = ti % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'

                  return (
                    <tr key={tech.id} className={`border-b border-gray-50 last:border-b-0 ${bgAlt}`}>
                      {/* Tech */}
                      <td className="px-4 py-2">
                        <Link href={`/admin/technicians/${tech.id}`} className="flex items-center gap-2 hover:opacity-75">
                          {tech.photo_url ? (
                            <img src={tech.photo_url} alt={tech.full_name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ background: '#46DA26' }}>
                              {tech.initials}
                            </div>
                          )}
                          <span className="font-medium text-gray-700 truncate">{tech.full_name.split(' ')[0]}</span>
                        </Link>
                      </td>

                      {/* AM */}
                      <td className="px-2 py-1.5 bg-blue-50/20">
                        {amVisit ? (
                          <div className="rounded px-2 py-1 text-xs font-medium truncate"
                            style={
                              ABSENCE_TYPES.has(amVisit.visit_type)
                                ? { background: hatchStyle(VISIT_COLOURS[amVisit.visit_type] ?? '#94a3b8'), color: VISIT_COLOURS[amVisit.visit_type] ?? '#94a3b8', border: `1px solid ${VISIT_COLOURS[amVisit.visit_type] ?? '#94a3b8'}88` }
                                : { background: VISIT_COLOURS[amVisit.visit_type] ?? '#C0392B', color: 'white' }
                            }
                            title={(amVisit.schools as { name: string } | null)?.name ?? ''}>
                            {ABSENCE_TYPES.has(amVisit.visit_type)
                              ? VISIT_LABELS[amVisit.visit_type]
                              : (amVisit.schools as { short_name: string | null; name: string } | null)?.short_name
                                || (amVisit.schools as { name: string } | null)?.name?.split(' ')[0]
                                || VISIT_LABELS[amVisit.visit_type]}
                          </div>
                        ) : (
                          <div className="rounded border border-dashed border-gray-100 h-7" />
                        )}
                      </td>

                      {/* PM */}
                      <td className="px-2 py-1.5 bg-orange-50/20">
                        {pmVisit ? (
                          <div className="rounded px-2 py-1 text-xs font-medium truncate"
                            style={
                              ABSENCE_TYPES.has(pmVisit.visit_type)
                                ? { background: hatchStyle(VISIT_COLOURS[pmVisit.visit_type] ?? '#94a3b8'), color: VISIT_COLOURS[pmVisit.visit_type] ?? '#94a3b8', border: `1px solid ${VISIT_COLOURS[pmVisit.visit_type] ?? '#94a3b8'}88` }
                                : { background: VISIT_COLOURS[pmVisit.visit_type] ?? '#C0392B', color: 'white' }
                            }
                            title={(pmVisit.schools as { name: string } | null)?.name ?? ''}>
                            {ABSENCE_TYPES.has(pmVisit.visit_type)
                              ? VISIT_LABELS[pmVisit.visit_type]
                              : (pmVisit.schools as { short_name: string | null; name: string } | null)?.short_name
                                || (pmVisit.schools as { name: string } | null)?.name?.split(' ')[0]
                                || VISIT_LABELS[pmVisit.visit_type]}
                          </div>
                        ) : (
                          <div className="rounded border border-dashed border-gray-100 h-7" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-t border-gray-50 bg-gray-50/50">
              {Object.entries(VISIT_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <div className="w-3 h-3 rounded-sm shrink-0"
                    style={{ background: ABSENCE_TYPES.has(key) ? hatchStyle(VISIT_COLOURS[key]) : VISIT_COLOURS[key] }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications — 1 col */}
        <div className="col-span-1 space-y-3">

          {/* Action items */}
          {(disrupted?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                Disrupted ({disrupted!.length})
              </h3>
              <div className="space-y-2">
                {disrupted!.slice(0, 3).map((v: { id: string; visit_date: string; schools: { name: string } | null; technicians: { full_name: string } | null }) => (
                  <div key={v.id} className="text-xs">
                    <p className="font-medium text-gray-900 truncate">{v.schools?.name}</p>
                    <p className="text-gray-400">{new Date(v.visit_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {v.technicians?.full_name.split(' ')[0]}</p>
                  </div>
                ))}
              </div>
              <Link href="/admin/schedule" className="mt-3 block text-xs text-gray-400 hover:text-gray-700">Resolve in planner →</Link>
            </div>
          )}

          {overdueBanked.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                Overdue banked ({overdueBanked.length})
              </h3>
              <div className="space-y-2">
                {overdueBanked.slice(0, 3).map((v: { id: string; banked_at: string; schools: { name: string } | null }) => (
                  <div key={v.id} className="text-xs">
                    <p className="font-medium text-gray-900 truncate">{v.schools?.name}</p>
                    <p className="text-gray-400">Banked {new Date(v.banked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                  </div>
                ))}
                {overdueBanked.length > 3 && <p className="text-xs text-gray-400">+{overdueBanked.length - 3} more</p>}
              </div>
              <Link href="/admin/schedule" className="mt-3 block text-xs text-gray-400 hover:text-gray-700">Schedule in planner →</Link>
            </div>
          )}

          {(lowFeedback?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                Low feedback ({lowFeedback!.length})
              </h3>
              <div className="space-y-2">
                {lowFeedback!.slice(0, 3).map((f: { id: string; rating: number; visits: { visit_date: string; schools: { name: string } | null } | null }) => (
                  <div key={f.id} className="text-xs">
                    <p className="font-medium text-gray-900 truncate">{f.visits?.schools?.name}</p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < f.rating ? 'text-amber-400' : 'text-gray-200'}>★</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(dbsExpiring?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                DBS expiring ({dbsExpiring!.length})
              </h3>
              <div className="space-y-2">
                {dbsExpiring!.map((t: { id: string; full_name: string; dbs_expiry_date: string }) => (
                  <div key={t.id} className="text-xs">
                    <Link href={`/admin/technicians/${t.id}`} className="font-medium text-gray-900 hover:text-gray-600 block">{t.full_name}</Link>
                    <p className="text-gray-400">Expires {new Date(t.dbs_expiry_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team milestones */}
          {milestones.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span>🎉</span> Coming up
              </h3>
              <div className="space-y-2">
                {milestones.map((m, i) => (
                  <div key={i} className="text-xs">
                    <Link href={`/admin/technicians/${m.techId}`} className="font-medium text-gray-900 hover:text-gray-600">
                      {m.name}
                    </Link>
                    <p className="text-gray-400">
                      {m.type === 'birthday'
                        ? `🎂 Birthday ${dayLabel(m.dateStr, today)}`
                        : `🏆 ${m.years} year${m.years !== 1 ? 's' : ''} ${dayLabel(m.dateStr, today)}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All clear */}
          {actionCount === 0 && milestones.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-400">No notifications</p>
              <p className="text-xs mt-1" style={{ color: '#46DA26' }}>All clear ✓</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}