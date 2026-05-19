import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import MarkAsLeaverButton from './MarkAsLeaverButton'
import AbsenceLog from './AbsenceLog'

export default async function TechnicianProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServiceSupabaseClient()

  const { data: tech } = await supabase
    .from('technicians')
    .select('*')
    .eq('id', id)
    .single()

  if (!tech) notFound()

  const isLeaver = !!tech.leaving_date

  return (
    <div className="max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/technicians" className="text-gray-400 hover:text-gray-600 text-sm">
            ← Technicians
          </Link>
          <span className="text-gray-200">/</span>
          <div className="flex items-center gap-3">
            {tech.photo_url ? (
              <img src={tech.photo_url} alt={tech.full_name}
                className="w-10 h-10 rounded-full object-cover border border-gray-100" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                style={{ background: tech.is_active ? '#46DA26' : '#94a3b8' }}>
                {tech.initials}
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-gray-900 leading-tight">{tech.full_name}</h1>
              {tech.job_title && (
                <p className="text-sm text-gray-500 mt-0.5">{tech.job_title}</p>
              )}
            </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isLeaver
              ? 'bg-orange-50 text-orange-700'
              : tech.is_active
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {isLeaver ? 'Leaver' : tech.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <Link
          href={`/admin/technicians/${id}/edit`}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
        >
          Edit
        </Link>
      </div>

      <div className="space-y-4">

        {/* Details */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-400">Email</dt>
              <dd className="text-gray-900 mt-0.5">{tech.email}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Initials</dt>
              <dd className="text-gray-900 font-mono mt-0.5">{tech.initials ?? '—'}</dd>
            </div>
            {tech.job_title && (
              <div>
                <dt className="text-gray-400">Job title</dt>
                <dd className="text-gray-900 mt-0.5">{tech.job_title}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-400">Home postcode</dt>
              <dd className="text-gray-900 font-mono mt-0.5">{tech.home_postcode ?? '—'}</dd>
            </div>
            {tech.date_of_birth && (
              <div>
                <dt className="text-gray-400">Date of birth</dt>
                <dd className="text-gray-900 mt-0.5">
                  {new Date(tech.date_of_birth + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </dd>
              </div>
            )}
          </dl>
          {tech.notes && (
            <div className="mt-4 pt-4 border-t border-gray-50">
              <dt className="text-xs text-gray-400 mb-1">Notes</dt>
              <dd className="text-sm text-gray-600">{tech.notes}</dd>
            </div>
          )}
        </div>

        {/* DBS */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">DBS information</h2>
          {tech.dbs_number ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-400">DBS number</dt>
                <dd className="text-gray-900 font-mono mt-0.5">{tech.dbs_number}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Certificate type</dt>
                <dd className="text-gray-900 mt-0.5 capitalize">{tech.dbs_type ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Issue date</dt>
                <dd className="text-gray-900 mt-0.5">
                  {tech.dbs_issue_date
                    ? new Date(tech.dbs_issue_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Expiry date</dt>
                <dd className={`mt-0.5 font-medium ${
                  tech.dbs_expiry_date && new Date(tech.dbs_expiry_date) < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
                    ? 'text-amber-600' : 'text-gray-900'
                }`}>
                  {tech.dbs_expiry_date
                    ? new Date(tech.dbs_expiry_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '—'}
                  {tech.dbs_expiry_date && new Date(tech.dbs_expiry_date) < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) && (
                    <span className="ml-2 text-xs font-normal">⚠ expiring soon</span>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-400">No DBS information recorded</p>
          )}
        </div>

        {/* Employment */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Employment</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-4">
            <div>
              <dt className="text-gray-400">Start date</dt>
              <dd className="text-gray-900 mt-0.5">
                {tech.start_date
                  ? new Date(tech.start_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—'}
              </dd>
            </div>
            {tech.leaving_date && (
              <div>
                <dt className="text-gray-400">Leaving date</dt>
                <dd className="text-orange-600 font-medium mt-0.5">
                  {new Date(tech.leaving_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </dd>
              </div>
            )}
          </dl>

          {isLeaver ? (
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
              <p className="text-sm font-medium text-orange-800">
                Leaving on {new Date(tech.leaving_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-xs text-orange-600 mt-1">
                All confirmed visits from that date have been banked for reassignment.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 mb-3">
                Marking as a leaver will bank all future confirmed visits from the leaving date onwards.
              </p>
              <MarkAsLeaverButton techId={id} techName={tech.full_name} />
            </div>
          )}
        </div>

        {/* Absence log — client component with year picker */}
        <AbsenceLog techId={id} />

      </div>
    </div>
  )
}