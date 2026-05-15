import { createBrowserClient } from '@supabase/ssr'

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'school_contact' | 'technician'
export type VisitSlot = 'am' | 'pm' | 'full_day'
export type VisitStatus = 'confirmed' | 'disrupted' | 'banked' | 'completed' | 'cancelled'
export type VisitDuration = 'half_day' | 'full_day'
export type ContractStatus = 'active' | 'expired' | 'superseded' | 'pending'
export type VisitFrequency =
  | 'weekly'
  | 'fortnightly'
  | 'three_weekly'
  | 'monthly'
  | 'half_termly'
  | 'termly'
  | 'custom'
export type AbsenceType = 'planned' | 'unplanned' | 'phone_duty'
export type PhoneShift = 'early' | 'standard' | 'late'

// ─── Row types ────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface School {
  id: string
  name: string
  short_name: string | null
  address_line_1: string | null
  address_line_2: string | null
  town: string | null
  county: string | null
  postcode: string | null
  term_date_region_id: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SchoolContact {
  id: string
  school_id: string
  profile_id: string | null
  full_name: string
  email: string
  phone: string | null
  role_title: string | null
  notify_visits: boolean
  is_primary: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Technician {
  id: string
  profile_id: string | null
  full_name: string
  initials: string | null
  email: string
  phone: string | null
  home_postcode: string | null
  ms_user_id: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Contract {
  id: string
  school_id: string
  academic_year: string
  start_date: string
  end_date: string
  visit_duration: VisitDuration
  status: ContractStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ContractAssignment {
  id: string
  contract_id: string
  amendment_id: string | null
  technician_id: string
  frequency: VisitFrequency
  custom_visits_per_year: number | null
  preferred_day: number | null
  preferred_slot: VisitSlot | null
  effective_from: string
  effective_to: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Visit {
  id: string
  assignment_id: string
  school_id: string
  technician_id: string
  visit_date: string
  slot: VisitSlot
  status: VisitStatus
  disrupted_at: string | null
  banked_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  disrupted_by_absence_id: string | null
  banked_overdue: boolean
  travel_warning: boolean
  travel_warning_approved_by: string | null
  travel_warning_approved_at: string | null
  outlook_event_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TechnicianAbsence {
  id: string
  technician_id: string
  absence_type: AbsenceType
  phone_shift: PhoneShift | null
  start_date: string
  end_date: string
  slot: VisitSlot
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Browser client ───────────────────────────────────────────────────────────
// Use in Client Components ('use client')

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const FREQUENCY_LABELS: Record<VisitFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  three_weekly: 'Every 3 weeks',
  monthly: 'Monthly',
  half_termly: 'Half-termly',
  termly: 'Termly',
  custom: 'Custom',
}

export const FREQUENCY_ANNUAL: Record<VisitFrequency, number> = {
  weekly: 38,
  fortnightly: 19,
  three_weekly: 13,
  monthly: 12,
  half_termly: 6,
  termly: 3,
  custom: 0,
}

export const SLOT_LABELS: Record<VisitSlot, string> = {
  am: 'AM (09:00–13:00)',
  pm: 'PM (13:00–17:00)',
  full_day: 'Full day (09:00–17:00)',
}

export const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
}