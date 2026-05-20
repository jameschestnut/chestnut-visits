import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const VISIT_TYPE_LABELS: Record<string, string> = {
  technology_partner: 'TP Visit',
  handover:           'Handover',
  shadow:             'Shadow',
  installation:       'Installation',
  phone_duty:         'Phone duty',
}

export default async function SchoolProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServiceSupabaseClient()

  const [{ data: school }, { data: recentVisits }] = await Promise.all([
    supabase
      .from('schools')
      .select(`*, school_contacts (*), contracts (*, visits (id, status))`)
      .eq('id', id)
      .single(),
    supabase
      .from('visits')
      .select('id, visit_date, slot, visit_type, status, notes, technicians (full_name)')
      .eq('school_id', id)
      .not('visit_type', 'in', '("annual_leave","sickness","other_absence")')
      .order('visit_date', { ascending: false })
      .limit(20),
  ])

  if (!school) notFound()

  const activeContract = school.contracts?.find(
    (c: { status: string }) => c.status === 'active'
  )

  const activeVisits   = activeContract?.visits ?? []
  const completedCount = activeVisits.filter((v: { status: string }) => v.status === 'completed').length
  const bankedCount    = activeVisits.filter((v: { status: string }) => v.status === 'banked').length
  const totalCount     = activeVisits.length
  const remainingCount = totalCount - completedCount - bankedCount

  return (
    <div className="max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/schools" className="text-gray-400 hover:text-gray-600 text-sm">
            ← Schools
          </Link>
          <span className="text-gray-200">/</span>
          {school.photo_url ? (
            <img src={school.photo_url} alt={school.name}
              className="w-9 h-9 rounded-lg object-cover border border-gray-100" />
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-semibold shrink-0"
              style={{ background: '#46DA26' }}>
              {(school.short_name || school.name).slice(0, 2).toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-semibold text-gray-900">{school.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            school.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {school.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <Link href={`/admin/schools/${id}/edit`}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* Left column */}
        <div className="col-span-2 space-y-4">

          {/* Details */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-400">Full name</dt>
                <dd className="text-gray-900 font-medium mt-0.5">{school.name}</dd>
              </div>
              {school.short_name && (
                <div>
                  <dt className="text-gray-400">Short name</dt>
                  <dd className="text-gray-900 font-medium mt-0.5">{school.short_name}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-400">Address</dt>
                <dd className="text-gray-900 mt-0.5 leading-relaxed">
                  {[school.address_line_1, school.address_line_2, school.town, school.county, school.postcode]
                    .filter(Boolean).join(', ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Postcode</dt>
                <dd className="text-gray-900 font-mono mt-0.5">{school.postcode ?? '—'}</dd>
              </div>
            </dl>
            {school.notes && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                <dt className="text-xs text-gray-400 mb-1">Notes</dt>
                <dd className="text-sm text-gray-600">{school.notes}</dd>
              </div>
            )}
          </div>

          {/* Contracts */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Contracts</h2>
              <div className="flex items-center gap-3">
                {activeContract && (
                  <Link href={`/admin/schools/${id}/schedule/generate`}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg text-white"
                    style={{ background: '#46DA26' }}>
                    Generate schedule
                  </Link>
                )}
                <Link href={`/admin/schools/${id}/contracts/new`}
                  className="text-xs text-gray-400 hover:text-gray-700">
                  + Add contract
                </Link>
              </div>
            </div>

            {school.contracts && school.contracts.length > 0 ? (
              <div className="space-y-3">
                {school.contracts
                  .sort((a: { start_date: string }, b: { start_date: string }) =>
                    new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
                  )
                  .map((contract: {
                    id: string; start_date: string; end_date: string
                    frequency: string; visit_duration: string; status: string
                    visits: { id: string; status: string }[]
                  }) => {
                    const cCompleted = contract.visits?.filter(v => v.status === 'completed').length ?? 0
                    const cTotal     = contract.visits?.length ?? 0
                    const isActive   = contract.status === 'active'
                    return (
                      <div key={contract.id}
                        className={`p-3 rounded-lg border text-sm ${isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-75'}`}>
                        <div className="flex items-center justify-between mb-1.5">
  <span className="font-medium text-gray-900">
    {new Date(contract.start_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
    {' – '}
    {new Date(contract.end_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
  </span>
  <div className="flex items-center gap-2">
    <Link href={`/admin/schools/${id}/contracts/${contract.id}/edit`}
      className="text-xs text-gray-400 hover:text-gray-700">
      Edit
    </Link>
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
      isActive ? 'bg-green-50 text-green-700' :
      contract.status === 'expired' ? 'bg-gray-100 text-gray-500' :
      'bg-amber-50 text-amber-700'
    }`}>{contract.status}</span>
  </div>
</div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="capitalize">{contract.frequency.replace('_', ' ')}</span>
                          <span>·</span>
                          <span>{contract.visit_duration === 'half_day' ? 'Half day' : 'Full day'}</span>
                          {cTotal > 0 && <><span>·</span><span>{cCompleted}/{cTotal} visits completed</span></>}
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400 mb-3">No contracts yet</p>
                <Link href={`/admin/schools/${id}/contracts/new`}
                  className="inline-flex px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: '#46DA26' }}>
                  Add contract
                </Link>
              </div>
            )}
          </div>

          {/* Visit history */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Visit history</h2>
              <Link href="/admin/reports" className="text-xs text-gray-400 hover:text-gray-700">
                Full report →
              </Link>
            </div>

            {recentVisits && recentVisits.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {recentVisits.map((v: {
                  id: string; visit_date: string; slot: string; visit_type: string
                  status: string; notes: string | null
                  technicians: { full_name: string } | null
                }) => (
                  <div key={v.id} className="flex items-center gap-3 py-2 text-xs">
                    <span className="text-gray-500 w-24 shrink-0">
                      {new Date(v.visit_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${
                      v.slot === 'am' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                    }`}>
                      {v.slot.toUpperCase()}
                    </span>
                    <span className="text-gray-600 flex-1 truncate">
                      {VISIT_TYPE_LABELS[v.visit_type] ?? v.visit_type}
                      {v.technicians?.full_name && ` · ${v.technicians.full_name.split(' ')[0]}`}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-medium shrink-0 capitalize ${
                      v.status === 'completed' ? 'bg-green-50 text-green-700' :
                      v.status === 'confirmed' ? 'bg-blue-50 text-blue-700' :
                      v.status === 'banked'    ? 'bg-purple-50 text-purple-700' :
                      v.status === 'disrupted' ? 'bg-red-50 text-red-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {v.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No visits yet</p>
            )}
          </div>

        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Contacts */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Contacts</h2>
              <Link href={`/admin/schools/${id}/contacts/new`}
                className="text-xs text-gray-400 hover:text-gray-700">
                + Add
              </Link>
            </div>
            {school.school_contacts?.length > 0 ? (
              <div className="space-y-3">
                {school.school_contacts.map((contact: {
                  id: string; full_name: string; role_title: string | null
                  email: string; notify_visits: boolean; is_primary: boolean
                }) => (
                  <div key={contact.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{contact.full_name}</span>
                        {contact.is_primary && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Primary</span>
                        )}
                      </div>
                      <Link href={`/admin/schools/${id}/contacts/${contact.id}/edit`}
                        className="text-xs text-gray-400 hover:text-gray-700 shrink-0">
                        Edit
                      </Link>
                    </div>
                    {contact.role_title && (
                      <p className="text-gray-400 text-xs mt-0.5">{contact.role_title}</p>
                    )}
                    <p className="text-gray-500 mt-0.5">{contact.email}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${contact.notify_visits ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-400">
                        {contact.notify_visits ? 'Receives notifications' : 'No notifications'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-3">No contacts yet</p>
            )}
          </div>

          {/* Visit stats */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              {activeContract ? 'This contract' : 'Visits'}
            </h2>
            {activeContract && totalCount > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Completed</span>
                  <span className="font-semibold text-gray-900">{completedCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Remaining</span>
                  <span className="font-semibold text-gray-900">{remainingCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Banked</span>
                  <span className="font-semibold text-gray-900">{bankedCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-gray-50 pt-3">
                  <span className="text-gray-500">Total scheduled</span>
                  <span className="font-semibold text-gray-900">{totalCount}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                {activeContract ? 'No visits scheduled yet' : 'No active contract'}
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}