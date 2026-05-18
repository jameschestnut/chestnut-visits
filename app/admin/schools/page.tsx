import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'

export default async function SchoolsPage() {
  const supabase = await createServiceSupabaseClient()

  const { data: schools, error } = await supabase
    .from('schools')
    .select(`
      *,
      contracts (
        id,
        status,
        academic_year
      )
    `)
    .order('name')

  if (error) {
  console.error('Schools query error:', JSON.stringify(error, null, 2))
  console.error('Error message:', error.message)
  console.error('Error code:', error.code)
}

  const active   = schools?.filter(s => s.is_active) ?? []
  const inactive = schools?.filter(s => !s.is_active) ?? []

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Schools</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active.length} active school{active.length !== 1 ? 's' : ''}
            {inactive.length > 0 && ` · ${inactive.length} inactive`}
          </p>
        </div>
        <Link
          href="/admin/schools/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#8B3A2A' }}
        >
          <span>+</span> Add school
        </Link>
      </div>

      {/* Schools table */}
      {schools && schools.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">School</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Town</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Postcode</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Contract</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {schools.map(school => {
                const activeContract = school.contracts?.find(
                  (c: { status: string }) => c.status === 'active'
                )
                return (
                  <tr
                    key={school.id}
                    className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
  <div className="flex items-center gap-3">
    {school.photo_url ? (
      <img
        src={school.photo_url}
        alt={school.name}
        className="w-8 h-8 rounded-lg object-cover border border-gray-100 shrink-0"
      />
    ) : (
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold shrink-0"
        style={{ background: '#8B3A2A' }}>
        {(school.short_name || school.name).slice(0, 2).toUpperCase()}
      </div>
    )}
    <div>
      <div className="font-medium text-gray-900">{school.name}</div>
      {school.short_name && (
        <div className="text-xs text-gray-400">{school.short_name}</div>
      )}
    </div>
  </div>
</td>
                    <td className="px-4 py-3 text-gray-600">{school.town ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{school.postcode ?? '—'}</td>
                    <td className="px-4 py-3">
                      {activeContract ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                          {activeContract.academic_year}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No active contract</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        school.is_active
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {school.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/schools/${school.id}`}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 border-dashed p-12 text-center">
          <p className="text-gray-500 text-sm mb-4">No schools added yet</p>
          <Link
            href="/admin/schools/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#8B3A2A' }}
          >
            Add your first school
          </Link>
        </div>
      )}
    </div>
  )
}