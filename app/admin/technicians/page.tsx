import { createServiceSupabaseClient } from '@/lib/supabase-server'
import Link from 'next/link'

export default async function TechniciansPage() {
  const supabase = await createServiceSupabaseClient()

  const { data: technicians, error } = await supabase
    .from('technicians')
    .select('*')
    .order('full_name')

  if (error) {
    console.error('Technicians query error:', JSON.stringify(error, null, 2))
  }

  const active   = technicians?.filter(t => t.is_active) ?? []
  const inactive = technicians?.filter(t => !t.is_active) ?? []

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Technicians</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active.length} active technician{active.length !== 1 ? 's' : ''}
            {inactive.length > 0 && ` · ${inactive.length} inactive`}
          </p>
        </div>
        <Link
          href="/admin/technicians/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#8B3A2A' }}
        >
          <span>+</span> Add technician
        </Link>
      </div>

      {technicians && technicians.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {technicians.map(tech => (
                <tr key={tech.id}
                  className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                        style={{ background: tech.is_active ? '#8B3A2A' : '#94a3b8' }}>
                        {tech.initials || tech.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{tech.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{tech.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      tech.is_active
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tech.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/technicians/${tech.id}`}
                      className="text-xs text-gray-400 hover:text-gray-700"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 border-dashed p-12 text-center">
          <p className="text-gray-500 text-sm mb-4">No technicians added yet</p>
          <Link
            href="/admin/technicians/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#8B3A2A' }}
          >
            Add your first technician
          </Link>
        </div>
      )}
    </div>
  )
}