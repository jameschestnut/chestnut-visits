import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'

const VISIT_COLOURS: Record<string, string> = {
  technology_partner: '#C0392B',
  phone_duty:         '#1A6FA8',
  installation:       '#1D6FA4',
  handover:           '#7A5C2E',
  shadow:             '#3D6B5E',
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getWeekDates(): { date: Date; dateStr: string; label: string; isToday: boolean }[] {
  const today  = new Date()
  const monday = new Date(today)
  const dow    = today.getDay()
  monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow))
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const dateStr = toDateStr(date)
    return { date, dateStr, label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), isToday: dateStr === toDateStr(today) }
  })
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

export default async function AdminDashboard() {
  const supabase  = await createServiceSupabaseClient()
  const weekDates = getWeekDates()
  const today     = new Date()
  const todayStr  = toDateStr(today)
  const weekStart = weekDates[0].dateStr
  const weekEnd   = weekDates[4].dateStr

  const [
    { data: technicians },
    { data: weekVisits },
    { data: disrupted },
    { data: banked },
    { data: lowFeedback },
    { data: dbsExpiring },
    { data: weekAbsences },
  ] = await Promise.all([
    supabase.from('technicians').select('id, full_name, initials, photo_url').eq('is_active', true).order('full_name'),
    supabase.from('visits').select('id, visit_date, slot, status, visit_type, travel_warning, technician_id, schools (id, name, short_name)')
      .in('status', ['confirmed', 'completed'])
      .gte('visit_date', weekStart)
      .lte('visit_date', weekEnd),
    supabase.from('visits').select('id, visit_date, slot, schools (id, name, short_name), technicians (id, full_name, initials)')
      .eq('status', 'disrupted').order('visit_date'),
    supabase.from('visits').select('id, visit_date, banked_at, schools (id, name, short_name), technicians (id, full_name, initials)')
      .eq('status', 'banked').order('banked_at'),
    supabase.from('visit_feedback').select('id, rating, comment, submitted_at, visits (visit_date, schools (id, name))')
      .lte('rating', 2)
      .eq('needs_followup', true)
      .is('followup_dismissed_at', null)
      .not('submitted_at', 'is', null),
    supabase.from('technicians').select('id, full_name, dbs_expiry_date')
      .eq('is_active', true)
      .not('dbs_expiry_date', 'is', null)
      .lte('dbs_expiry_date', new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    // Fetch absences for the whole week, not just today
    supabase.from('technician_absences').select('id, technician_id, slot, absence_type, start_date, end_date')
      .lte('start_date', weekEnd)
      .gte('end_date', weekStart),
  ])

  // Build lookup: techId-dateStr-slot → absence
  function getAbsence(techId: string, dateStr: string, slot: string) {
    return (weekAbsences ?? []).find((a: {
      technician_id: string; slot: string; start_date: string; end_date: string
    }) =>
      a.technician_id === techId &&
      dateStr >= a.start_date &&
      dateStr <= a.end_date &&
      (a.slot === 'full_day' || a.slot === slot)
    )
  }

  function getVisit(techId: string, dateStr: string, slot: string) {
    return (weekVisits ?? []).find((v: { technician_id: string; visit_date: string; slot: string }) =>
      v.technician_id === techId &&
      v.visit_date    === dateStr &&
      (v.slot === slot || (v.slot === 'full_day' && (slot === 'am' || slot === 'pm')))
    )
  }

  const overdueBanked = (banked ?? []).filter((v: { banked_at: string | null }) => {
    if (!v.banked_at) return false
    return today >= addWorkingDays(new Date(v.banked_at), 5)
  })

  const actionCount = (disrupted?.length ?? 0) + overdueBanked.length + (lowFeedback?.length ?? 0) + (dbsExpiring?.length ?? 0)

  return (
    <div className="max-w-6xl">

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

      <div className="grid grid-cols-4 gap-4">

        {/* Weekly calendar — 3 cols */}
        <div className="col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

            {/* Column headers */}
            <div className="grid border-b border-gray-100 bg-gray-50"
              style={{ gridTemplateColumns: `140px repeat(${weekDates.length}, 1fr)` }}>
              <div className="px-3 py-2.5 text-xs font-medium text-gray-400">Technician</div>
              {weekDates.map(d => (
                <div key={d.dateStr}
                  className="px-2 py-2.5 text-xs font-medium text-center"
                  style={{
                    background: d.isToday ? '#46DA26' : undefined,
                    color:      d.isToday ? 'white'   : '#6b7280',
                  }}>
                  {d.label}
                </div>
              ))}
            </div>

            {/* Technician rows */}
            {(technicians ?? []).map((tech, ti) => (
              ['am', 'pm'].map((slot, si) => (
                <div key={`${tech.id}-${slot}`}
                  className="grid border-b border-gray-50 last:border-b-0"
                  style={{ gridTemplateColumns: `140px repeat(${weekDates.length}, 1fr)` }}>

                  {/* Tech label — AM row only */}
                  {si === 0 ? (
                    <div className="px-3 py-1.5 border-r border-gray-50 bg-gray-50/80 flex items-center gap-2">
                      {tech.photo_url ? (
                        <img src={tech.photo_url} alt={tech.full_name}
                          className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: '#46DA26' }}>
                          {tech.initials}
                        </div>
                      )}
                      <span className="text-xs font-semibold text-gray-700 truncate">{tech.full_name.split(' ')[0]}</span>
                    </div>
                  ) : (
                    <div className="border-r border-gray-50 bg-gray-50/80 flex items-center justify-center">
                      <span className={`text-xs px-1 py-0.5 rounded font-medium ${slot === 'am' ? 'text-blue-500 bg-blue-50' : 'text-orange-500 bg-orange-50'}`}>
                        {slot.toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Day cells */}
                  {weekDates.map(d => {
                    const visit   = getVisit(tech.id, d.dateStr, slot)
                    const absence = getAbsence(tech.id, d.dateStr, slot)
                    const isPast  = d.dateStr < todayStr && !d.isToday

                    return (
                      <div key={d.dateStr}
                        className={`px-1 py-1 border-r border-gray-50 last:border-r-0 min-h-[30px] ${isPast ? 'opacity-40' : ''}`}>

                        {absence ? (
                          <div className="h-full rounded text-xs flex items-center px-1.5"
                            style={{
                              background: absence.absence_type === 'unplanned'
                                ? 'repeating-linear-gradient(45deg,#fca5a5,#fca5a5 3px,#fee2e2 3px,#fee2e2 7px)'
                                : 'repeating-linear-gradient(45deg,#cbd5e1,#cbd5e1 3px,#e2e8f0 3px,#e2e8f0 7px)',
                              minHeight: 28,
                              border: `1px solid ${absence.absence_type === 'unplanned' ? '#f87171' : '#94a3b8'}`,
                            }}>
                            <span className={`text-xs font-medium ${absence.absence_type === 'unplanned' ? 'text-red-700' : 'text-gray-500'}`}>
                              {absence.absence_type === 'unplanned' ? 'Sick' : absence.absence_type === 'planned' ? 'Leave' : 'Away'}
                            </span>
                          </div>
                        ) : visit ? (
                          <div
                            className={`rounded px-1.5 py-1 text-white text-xs font-medium truncate flex items-center justify-between gap-1 ${visit.status === 'completed' ? 'opacity-60' : ''}`}
                            style={{ background: VISIT_COLOURS[visit.visit_type as string] ?? '#C0392B', minHeight: 28 }}
                            title={(visit.schools as { name: string } | null)?.name ?? ''}
                          >
                            <span className="truncate">
                              {visit.visit_type === 'phone_duty'
                                ? '📞'
                                : (visit.schools as { short_name: string | null; name: string } | null)?.short_name
                                  || (visit.schools as { name: string } | null)?.name?.split(' ')[0]}
                            </span>
                            {(visit as { travel_warning: boolean }).travel_warning && <span className="text-yellow-300 shrink-0">⚠</span>}
                            {visit.status === 'completed' && <span className="shrink-0">✓</span>}
                          </div>
                        ) : (
                          <div className="rounded border border-dashed border-gray-100 min-h-[28px]" />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            ))}

          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2 px-1">
            {[['#C0392B','TP Visit'],['#1A6FA8','Phone duty']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-3 h-3 rounded-sm" style={{ background: c }} />{l}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'repeating-linear-gradient(45deg,#cbd5e1,#cbd5e1 2px,#e2e8f0 2px,#e2e8f0 5px)' }} />Leave
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'repeating-linear-gradient(45deg,#fca5a5,#fca5a5 2px,#fee2e2 2px,#fee2e2 5px)' }} />Sickness
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="text-yellow-500">⚠</span>Travel warning</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">✓ Completed</div>
          </div>
        </div>

        {/* Action items — 1 col */}
        <div className="col-span-1 space-y-3">

          {(disrupted?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                Disrupted ({disrupted!.length})
              </h3>
              <div className="space-y-2">
                {disrupted!.map((v: { id: string; visit_date: string; schools: { name: string } | null; technicians: { full_name: string } | null }) => (
                  <div key={v.id} className="text-xs">
                    <p className="font-medium text-gray-900 truncate">{v.schools?.name}</p>
                    <p className="text-gray-400">
                      {new Date(v.visit_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {' · '}{v.technicians?.full_name.split(' ')[0]}
                    </p>
                  </div>
                ))}
              </div>
              <Link href="/admin/schedule" className="mt-3 block text-xs text-gray-400 hover:text-gray-700">
                Resolve in planner →
              </Link>
            </div>
          )}

          {overdueBanked.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                Overdue banked ({overdueBanked.length})
              </h3>
              <div className="space-y-2">
                {overdueBanked.map((v: { id: string; visit_date: string; banked_at: string; schools: { name: string } | null }) => (
                  <div key={v.id} className="text-xs">
                    <p className="font-medium text-gray-900 truncate">{v.schools?.name}</p>
                    <p className="text-gray-400">
                      Banked {new Date(v.banked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
              <Link href="/admin/schedule" className="mt-3 block text-xs text-gray-400 hover:text-gray-700">
                Schedule in planner →
              </Link>
            </div>
          )}

          {(lowFeedback?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                Low feedback ({lowFeedback!.length})
              </h3>
              <div className="space-y-2">
                {lowFeedback!.map((f: { id: string; rating: number; comment: string | null; visits: { visit_date: string; schools: { name: string } | null } | null }) => (
                  <div key={f.id} className="text-xs">
                    <p className="font-medium text-gray-900 truncate">{f.visits?.schools?.name}</p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < f.rating ? 'text-amber-400' : 'text-gray-200'}>★</span>
                      ))}
                    </div>
                    {f.comment && <p className="text-gray-400 mt-0.5 truncate">"{f.comment}"</p>}
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
                    <Link href={`/admin/technicians/${t.id}`}
                      className="font-medium text-gray-900 hover:text-gray-600 block truncate">
                      {t.full_name}
                    </Link>
                    <p className="text-gray-400">
                      Expires {new Date(t.dbs_expiry_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {actionCount === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-400">No action items</p>
              <p className="text-xs text-green-600 mt-1">All clear ✓</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}