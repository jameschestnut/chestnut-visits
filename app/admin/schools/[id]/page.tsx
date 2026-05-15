import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function SchoolProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServiceSupabaseClient()

  // Fetch school with contacts and contracts
  const { data: school } = await supabase
    .from('schools')
    .select(`
      *,
      school_contacts (*),
      contracts (
        *,
        contract_assignments (
          *,
          technicians (
            id,
            full_name,
            initials
          )
        )
      )
    `)
    .eq('id', id)
    .single()

  if (!school) notFound()

  const activeContract = school.contracts?.find(
    (c: { status: string }) => c.status === 'active'
  )

  const primaryContact = school.school_contacts?.find(
    (c: { is_primary: boolean }) => c.is_primary
  )

  return (
    <div className="max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/schools" className="text-gray-400 hover:text-gray-600 text-sm">
            ← Schools
          </Link>
          <span className="text-gray-200">/</span>
          <h1 className="text-xl font-semibold text-gray-900">{school.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            school.is_active
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {school.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <Link
          href={`/admin/schools/${id}/edit`}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* Left column */}
        <div className="col-span-2 space-y-4">

          {/* School details */}
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
                  {[
                    school.address_line_1,
                    school.address_line_2,
                    school.town,
                    school.county,
                    school.postcode,
                  ]
                    .filter(Boolean)
                    .join(', ') || '—'}
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

          {/* Active contract */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Contract</h2>
              <Link
                href={`/admin/schools/${id}/contracts/new`}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                + Add contract
              </Link>
            </div>

            {activeContract ? (
              <div>
                <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                  <div>
                    <dt className="text-gray-400 text-xs">Academic year</dt>
                    <dd className="text-gray-900 font-medium mt-0.5">{activeContract.academic_year}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 text-xs">Visit duration</dt>
                    <dd className="text-gray-900 font-medium mt-0.5 capitalize">
                      {activeContract.visit_duration === 'half_day' ? 'Half day (3.5hr)' : 'Full day (7hr)'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 text-xs">Period</dt>
                    <dd className="text-gray-900 font-medium mt-0.5">
                      {new Date(activeContract.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' – '}
                      {new Date(activeContract.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </dd>
                  </div>
                </div>

                {/* Assignment lines */}
                {activeContract.contract_assignments?.length > 0 && (
                  <div className="border-t border-gray-50 pt-4">
                    <p className="text-xs text-gray-400 mb-3">Assignment lines</p>
                    <div className="space-y-2">
                      {activeContract.contract_assignments.map((a: {
                        id: string
                        technicians: { full_name: string; initials: string }
                        frequency: string
                        preferred_day: number | null
                        preferred_slot: string | null
                      }) => {
                        const dayNames: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' }
                        return (
                          <div key={a.id} className="flex items-center gap-3 text-sm">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                              style={{ background: '#8B3A2A' }}>
                              {a.technicians?.initials}
                            </div>
                            <span className="text-gray-900 font-medium">{a.technicians?.full_name}</span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-600 capitalize">{a.frequency.replace('_', ' ')}</span>
                            {a.preferred_day && (
                              <>
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-600">{dayNames[a.preferred_day]}</span>
                              </>
                            )}
                            {a.preferred_slot && (
                              <>
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-600 uppercase">{a.preferred_slot}</span>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400 mb-3">No active contract</p>
                <Link
                  href={`/admin/schools/${id}/contracts/new`}
                  className="inline-flex px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: '#8B3A2A' }}
                >
                  Add contract
                </Link>
              </div>
            )}
          </div>

        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Contacts */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Contacts</h2>
              <Link
                href={`/admin/schools/${id}/contacts/new`}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                + Add
              </Link>
            </div>

            {school.school_contacts?.length > 0 ? (
              <div className="space-y-3">
                {school.school_contacts.map((contact: {
                  id: string
                  full_name: string
                  role_title: string | null
                  email: string
                  phone: string | null
                  notify_visits: boolean
                  is_primary: boolean
                }) => (
                  <div key={contact.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{contact.full_name}</span>
                      {contact.is_primary && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Primary</span>
                      )}
                    </div>
                    {contact.role_title && (
                      <p className="text-gray-400 text-xs mt-0.5">{contact.role_title}</p>
                    )}
                    <p className="text-gray-500 mt-0.5">{contact.email}</p>
                    {contact.phone && (
                      <p className="text-gray-500">{contact.phone}</p>
                    )}
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
            <h2 className="text-sm font-semibold text-gray-700 mb-4">This year</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Visits completed</span>
                <span className="font-semibold text-gray-900">—</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Visits remaining</span>
                <span className="font-semibold text-gray-900">—</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Banked visits</span>
                <span className="font-semibold text-gray-900">—</span>
              </div>
            </div>
            <p className="text-xs text-gray-300 mt-3">Available once visits are scheduled</p>
          </div>

        </div>
      </div>
    </div>
  )
}