import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SchoolContractView from './SchoolContractView'

export default async function SchoolProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServiceSupabaseClient()

  const [{ data: school }, { data: allVisits }] = await Promise.all([
    supabase
      .from('schools')
      .select('*, school_contacts (*), contracts (id, start_date, end_date, frequency, visit_duration, status)')
      .eq('id', id)
      .single(),
    supabase
      .from('visits')
      .select('id, visit_date, slot, visit_type, status, notes, technicians (full_name)')
      .eq('school_id', id)
      .not('visit_type', 'in', '("annual_leave","sickness","other_absence")')
      .order('visit_date', { ascending: true }),
  ])

  if (!school) notFound()

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

      {/* Details */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
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

      <SchoolContractView
        schoolId={id}
        contracts={school.contracts ?? []}
        allVisits={allVisits ?? []}
        contacts={school.school_contacts ?? []}
      />

    </div>
  )
}
