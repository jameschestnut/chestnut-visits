import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function TechnicianProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServiceSupabaseClient()

const { data: tech } = await supabase
    .from('technicians')
    .select(`
      *,
      technician_absences (*)
    `)
    .eq('id', id)
    .single()

  if (!tech) notFound()

  const activeAssignments = tech.contract_assignments?.filter(
    (a: { is_active: boolean; contracts: { status: string } | null }) =>
      a.is_active && a.contracts?.status === 'active'
  ) ?? []

  const upcomingAbsences = tech.technician_absences
    ?.filter((a: { end_date: string }) => new Date(a.end_date) >= new Date())
    .sort((a: { start_date: string }, b: { start_date: string }) =>
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    ) ?? []

  const pastAbsences = tech.technician_absences
    ?.filter((a: { end_date: string }) => new Date(a.end_date) < new Date())
    .sort((a: { start_date: string }, b: { start_date: string }) =>
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    ) ?? []

  const SLOT_LABELS: Record<string, string> = {
    am: 'AM only',
    pm: 'PM only',
    full_day: 'Full day',
  }

  const ABSENCE_LABELS: Record<string, string> = {
    planned: 'Annual leave',
    unplanned: 'Sickness',
    phone_duty: 'Phone duty',
  }

  const ABSENCE_COLOURS: Record<string, string> = {
    planned: 'bg-blue-50 text-blue-700',
    unplanned: 'bg-red-50 text-red-700',
    phone_duty: 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/technicians" className="text-gray-400 hover:text-gray-600 text-sm">
            ← Technicians
          </Link>
          <span className="text-gray-200">/</span>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
              style={{ background: '#8B3A2A' }}>
              {tech.initials}
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{tech.full_name}</h1>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            tech.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {tech.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <Link
          href={`/admin/technicians/${id}/edit`}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4">

        {/* Left column */}
        <div className="col-span-2 space-y-4">

          {/* Details */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-400">Email</dt>
                <dd className="text-gray-900 mt-0.5">{tech.email}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Phone</dt>
                <dd className="text-gray-900 mt-0.5">{tech.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Initials</dt>
                <dd className="text-gray-900 font-mono mt-0.5">{tech.initials ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Home postcode</dt>
                <dd className="text-gray-900 font-mono mt-0.5">{tech.home_postcode ?? '—'}</dd>
              </div>
            </dl>
            {tech.notes && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                <dt className="text-xs text-gray-400 mb-1">Notes</dt>
                <dd className="text-sm text-gray-600">{tech.notes}</dd>
              </div>
            )}
          </div>

          {/* Absence log */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Absence log</h2>
              <Link
                href={`/admin/technicians/${id}/absences/new`}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-white"
                style={{ background: '#8B3A2A' }}
              >
                + Add absence
              </Link>
            </div>

            {upcomingAbsences.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-2">Upcoming</p>
                <div className="space-y-2">
                  {upcomingAbsences.map((absence: {
                    id: string
                    absence_type: string
                    start_date: string
                    end_date: string
                    slot: string
                    notes: string | null
                  }) => (
                    <div key={absence.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ABSENCE_COLOURS[absence.absence_type]}`}>
                        {ABSENCE_LABELS[absence.absence_type]}
                      </span>
                      <span className="text-gray-600">
                        {new Date(absence.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {absence.start_date !== absence.end_date && (
                          <> – {new Date(absence.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
                        )}
                      </span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">{SLOT_LABELS[absence.slot]}</span>
                      {absence.notes && (
                        <>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-400 truncate">{absence.notes}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pastAbsences.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Past</p>
                <div className="space-y-2">
                  {pastAbsences.slice(0, 5).map((absence: {
                    id: string
                    absence_type: string
                    start_date: string
                    end_date: string
                    slot: string
                    notes: string | null
                  }) => (
                    <div key={absence.id}
                      className="flex items-center gap-3 p-3 rounded-lg text-sm border border-gray-50">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium opacity-60 ${ABSENCE_COLOURS[absence.absence_type]}`}>
                        {ABSENCE_LABELS[absence.absence_type]}
                      </span>
                      <span className="text-gray-400">
                        {new Date(absence.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {absence.start_date !== absence.end_date && (
                          <> – {new Date(absence.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
                        )}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400">{SLOT_LABELS[absence.slot]}</span>
                    </div>
                  ))}
                  {pastAbsences.length > 5 && (
                    <p className="text-xs text-gray-400 pl-3">+{pastAbsences.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {upcomingAbsences.length === 0 && pastAbsences.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No absences recorded</p>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}