'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Contract {
  status: string
  start_date: string
  end_date: string
}

interface School {
  id: string
  name: string
  short_name: string | null
  is_active: boolean
  photo_url: string | null
  town: string | null
  contracts: Contract[]
}

export default function SchoolsPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [schools, setSchools]       = useState<School[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [hideInactive, setHideInactive] = useState(true)
  const [sortCol, setSortCol]       = useState<'name'>('name')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('schools')
        .select('id, name, short_name, is_active, photo_url, town, contracts (status, start_date, end_date)')
        .order('name')
      setSchools(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date().toISOString().split('T')[0]
  function hasActiveContract(s: School) {
    return s.contracts?.some(c => c.status === 'active' && c.start_date <= today && c.end_date >= today) ?? false
  }

  const activeCount   = schools.filter(s => hasActiveContract(s)).length
  const inactiveCount = schools.filter(s => !hasActiveContract(s)).length

  function toggleSort(col: 'name') {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const filtered = schools
    .filter(s => (hideInactive && !search) ? hasActiveContract(s) : true)
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.short_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = (a[sortCol] ?? '').toLowerCase()
      const bv = (b[sortCol] ?? '').toLowerCase()
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Schools</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active school{activeCount !== 1 ? 's' : ''}
            {inactiveCount > 0 && ` · ${inactiveCount} inactive`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-48" />
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={hideInactive} onChange={e => setHideInactive(e.target.checked)} className="accent-gray-900" />
              <span className="text-sm text-gray-600">Hide inactive</span>
            </label>
          )}
          <Link
            href="/admin/schools/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#46DA26' }}
          >
            <span>+</span> Add school
          </Link>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-800" onClick={() => toggleSort('name')}>
                  School {sortDir === 'asc' ? '↑' : '↓'}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(school => (
                <tr
                  key={school.id}
                  onClick={() => router.push(`/admin/schools/${school.id}`)}
                  className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {school.photo_url ? (
                        <img src={school.photo_url} alt={school.name}
                          className="w-8 h-8 rounded-lg object-cover border border-gray-100 shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold shrink-0"
                          style={{ background: '#46DA26' }}>
                          {(school.short_name || school.name).slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className={`font-medium ${hasActiveContract(school) ? 'text-gray-900' : 'text-gray-400'}`}>
                          {school.name}
                        </div>
                        {school.short_name && (
                          <div className="text-xs text-gray-400">{school.short_name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      hasActiveContract(school) ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {hasActiveContract(school) ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 border-dashed p-12 text-center">
          <p className="text-gray-500 text-sm mb-4">No schools added yet</p>
          <Link href="/admin/schools/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#46DA26' }}>
            Add your first school
          </Link>
        </div>
      )}
    </div>
  )
}