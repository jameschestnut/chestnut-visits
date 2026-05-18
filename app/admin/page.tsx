import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'

const SLOT_TIMES: Record<string, string> = {
  am:       'AM',
  pm:       'PM',
  full_day: 'Full day',
}

function getWeekDates(): { date: Date; dateStr: string; label: string; isToday: boolean }[] {
  const today = new Date()
  const monday = new Date(today)
  const dow = today.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  monday.setDate(today.getDate() + diff)

  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return {
      date,
      dateStr,
      label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      isToday: dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    }
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
  const todayStr  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const weekStart = weekDates[0].dateStr
  const weekEnd   = weekDates[4].dateStr

  // Fetch all data in parallel
  const [
    { data: technicians },
    { data: weekVisits },
    { data: disrupted },
    { data: banked },
    { data: lowFeedback },
    { data: dbsExpiring },
    { data: todayAbsences },
  ] = await Promise.all([
    supabase.from('technicians').select('id, full_name, initials, photo_url').eq('is_active', true).order('full_name'),
    supabase.from('visits').select(`
      id, visit_date, slot, status, visit_type, travel_warning,
      schools (id, name, short_name),
      technicians (id, full_name, initials)
    `).in('status', ['confirmed', 'completed'])
      .gte('visit_date', weekStart)
      .lte('visit_date', weekEnd),
    supabase.from('visits').select(`
      id, visit_date, slot,
      schools (id, name, short_name),
      technicians (id, full_name, initials)
    `).eq('status', 'disrupted').order('visit_date'),
    supabase.from('visits').select(`
      id, visit_date, banked_at, banked_overdue,
      schools (id, name, short_name),
      technicians (id, full_name, initials)
    `).eq('status', 'banked').order('banked_at'),
    supabase.from('visit_feedback').select(`
      id, rating, comment, submitted_at,
      visits (visit_date, schools (id, name))
    `).lte('rating', 2)
      .eq('needs_followup', true)
      .is('followup_dismissed_at', null)
      .not('submitted_at', 'is', null),
    supabase.from('technicians').select('id, full_name, dbs_expiry_date')
      .eq('is_active', true)
      .not('dbs_expiry_date', 'is', null)
      .lte('dbs_expiry_date', new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    supabase.from('technician_absences').select('technician_id, slot, absence_type')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr),
  ])

  // Build a set of absent tech+slot combos for today
  const absentToday = new Set(
    (todayAbsences ?? []).map((a: { technician_id: string; slot: string }) =>
      `${a.technician_id}-${a.slot}`
    )
  )

  // Check overdue banked visits (>5 working days)
  const overdueBanked = (banked ?? []).filter((v: { banked_at: string | null }) => {
    if (!v.banked_at) return false
    const bankedDate  = new Date(v.banked_at)
    const overdueDate = addWorkingDays(bankedDate, 5)
    return today >= overdueDate
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
                  className={`px-2 py-2.5 text-xs font-medium text-center ${
                    d.isToday ? 'text-white' : 'text-gray-500'
                  }`}
                  style={d.isToday ? { background: '#8B3A2A' } : {}}>
                  {d.label}
                </div>
              ))}
            </div>

            {/* Technician rows */}
            {(technicians ?? []).map(tech => (
              ['am', 'pm'].map((slot, si) => (
                <div key={`${tech.id}-${slot}`}
                  className={`grid border-b border-gray-50 last:border-b-0 ${slot === 'pm' ? 'border-gray-100' : ''}`}
                  style={{ gridTemplateColumns: `140px repeat(${weekDates.length}, 1fr)` }}>

                  {/* Tech label — only on AM row */}
                  {si === 0 ? (
                    <div className="px-3 py-1.5 border-r border-gray-50 bg-gray-50 flex items-center gap-2 row-span-2">
                      {tech.photo_url ? (
                        <img src={tech.photo_url} alt={tech.full_name}
                          className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                          style={{ background: '#8B3A2A' }}>
                          {tech.initials}
                        </div>
                      )}
                      <span className="text-xs font-medium text-gray-700 truncate">{tech.full_name.split(' ')[0]}</span>
                    </div>
                  ) : (
                    <div className="border-r border-gray-50 bg-gray-50" />
                  )}

                  {/* Day cells */}
                  {weekDates.map(d => {
                    const visit = (weekVisits ?? []).find((v: {
                      visit_date: string
                      slot: string
                      technicians: { id: string } | null
                    }) =>
                      v.visit_date === d.dateStr &&
                      v.slot === slot &&
                      v.technicians?.id === tech.id
                    )

                    const isAbsent = absentToday.has(`${tech.id}-${slot}`) && d.isToday
                    const isPast   = d.dateStr < todayStr

                    return (
                      <div key={d.dateStr}
                        className={`px-1.5 py-1 border-r border-gray-50 last:border-r-0 min-h-[32px] ${
                          isPast && !d.isToday ? 'opacity-40' : ''
                        }`}>
                        {isAbsent ? (
                          <div className="h-full rounded text-xs flex items-center px-1.5"
                            style={{
                              background: 'repeating-linear-gradient(45deg,#cbd5e1,#cbd5e1 3px,#e2e8f0 3px,#e2e8f0 7px)',
                              minHeight: 28,
                            }}>
                            <span className="text-gray-500 text-xs">Absent</span>
                          </div>
                        ) : visit ? (
                          <div
                            className={`rounded px-1.5 py-1 text-white text-xs font-medium truncate flex items-center justify-between gap-1 ${
                              visit.status === 'completed' ? 'opacity-60' : ''
                            }`}
                            style={{ background: visit.visit_type === 'phone_duty' ? '#1A6FA8' : '#C0392B', minHeight: 28 }}
                            title={(visit.schools as { name: string } | null)?.name}
                          >
                            <span className="truncate">
                              {visit.visit_type === 'phone_duty'
                                ? '📞'
                                : (visit.schools as { short_name: string | null; name: string } | null)?.short_name
                                  || (visit.schools as { name: string } | null)?.name?.split(' ')[0]}
                            </span>
                            {visit.travel_warning && <span className="text-yellow-300 shrink-0">⚠</span>}
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
          <div className="flex items-center gap-5 mt-2 px-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#C0392B' }} /> TP Visit
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#1A6FA8' }} /> Phone duty
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-3 h-3 rounded-sm"
                style={{ background: 'repeating-linear-gradient(45deg,#cbd5e1,#cbd5e1 2px,#e2e8f0 2px,#e2e8f0 5px)' }} />
              Absent
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="text-yellow-500">⚠</span> Travel warning
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span>✓</span> Completed
            </div>
          </div>
        </div>

        {/* Action items — 1 col */}
        <div className="col-span-1 space-y-3">

          {/* Disrupted visits */}
          {(disrupted?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                Disrupted ({disrupted!.length})
              </h3>
              <div className="space-y-2">
                {disrupted!.map((v: {
                  id: string
                  visit_date: string
                  schools: { id: string; name: string } | null
                  technicians: { full_name: string } | null
                }) => (
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

          {/* Overdue banked visits */}
          {overdueBanked.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                Overdue banked ({overdueBanked.length})
              </h3>
              <div className="space-y-2">
                {overdueBanked.map((v: {
                  id: string
                  visit_date: string
                  banked_at: string
                  schools: { name: string } | null
                }) => (
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

          {/* Low feedback */}
          {(lowFeedback?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                Low feedback ({lowFeedback!.length})
              </h3>
              <div className="space-y-2">
                {lowFeedback!.map((f: {
                  id: string
                  rating: number
                  comment: string | null
                  visits: { visit_date: string; schools: { id: string; name: string } | null } | null
                }) => (
                  <div key={f.id} className="text-xs">
                    <p className="font-medium text-gray-900 truncate">{f.visits?.schools?.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {Array.from({ length: f.rating }).map((_, i) => (
                        <span key={i} className="text-amber-400">★</span>
                      ))}
                      {Array.from({ length: 5 - f.rating }).map((_, i) => (
                        <span key={i} className="text-gray-200">★</span>
                      ))}
                    </div>
                    {f.comment && (
                      <p className="text-gray-400 mt-0.5 truncate">"{f.comment}"</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DBS expiring */}
          {(dbsExpiring?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                DBS expiring ({dbsExpiring!.length})
              </h3>
              <div className="space-y-2">
                {dbsExpiring!.map((t: {
                  id: string
                  full_name: string
                  dbs_expiry_date: string
                }) => (
                  <div key={t.id} className="text-xs">
                    <Link href={`/admin/technicians/${t.id}`}
                      className="font-medium text-gray-900 hover:text-gray-600 truncate block">
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

          {/* All clear */}
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