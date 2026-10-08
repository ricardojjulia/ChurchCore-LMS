'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { revalidatePath } from 'next/cache'
import {
  createStripeConnectAccountLink,
  getStripeConnectAccountStatus,
  createCourseCheckoutSession,
} from '@/lib/payments'

export async function getOrgPaymentSettings(): Promise<{
  success: boolean
  stripeConnectId?: string | null
  status?: string
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id || !['admin', 'manager', 'platform_admin'].includes(profile.role)) {
      return { success: false, error: 'Insufficient permissions' }
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_connect_id, stripe_connect_status')
      .eq('id', profile.org_id)
      .single()

    if (!org) return { success: false, error: 'Organization not found' }

    let chargesEnabled = false
    let payoutsEnabled = false
    let currentStatus = org.stripe_connect_status || 'not_connected'

    if (org.stripe_connect_id) {
      const liveStatus = await getStripeConnectAccountStatus(org.stripe_connect_id)
      chargesEnabled = liveStatus.chargesEnabled
      payoutsEnabled = liveStatus.payoutsEnabled
      currentStatus = liveStatus.status

      if (currentStatus !== org.stripe_connect_status) {
        const svc = createServiceClient()
        await svc
          .from('organizations')
          .update({ stripe_connect_status: currentStatus })
          .eq('id', profile.org_id)
      }
    }

    return {
      success: true,
      stripeConnectId: org.stripe_connect_id,
      status: currentStatus,
      chargesEnabled,
      payoutsEnabled,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to get payment settings' }
  }
}

export async function createStripeConnectLink(origin: string): Promise<{
  success: boolean
  url?: string
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id || !['admin', 'platform_admin'].includes(profile.role)) {
      return { success: false, error: 'Only organization administrators can connect Stripe accounts' }
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, stripe_connect_id')
      .eq('id', profile.org_id)
      .single()

    if (!org) return { success: false, error: 'Organization not found' }

    const returnUrl = `${origin}/admin/billing/payments?connect=success`
    const refreshUrl = `${origin}/admin/billing/payments?connect=refresh`

    const { accountId, url } = await createStripeConnectAccountLink({
      orgId: org.id,
      orgName: org.name,
      existingAccountId: org.stripe_connect_id,
      returnUrl,
      refreshUrl,
    })

    if (!org.stripe_connect_id) {
      const svc = createServiceClient()
      await svc
        .from('organizations')
        .update({
          stripe_connect_id: accountId,
          stripe_connect_status: 'pending',
        })
        .eq('id', org.id)
    }

    return { success: true, url }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create connect onboarding link' }
  }
}

export async function updateCoursePricing({
  courseId,
  priceCents,
  currency = 'usd',
  seatLimit = null,
}: {
  courseId: string
  priceCents: number
  currency?: string
  seatLimit?: number | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id || !['admin', 'manager', 'teacher', 'platform_admin'].includes(profile.role)) {
      return { success: false, error: 'Insufficient permissions to update course pricing' }
    }

    if (priceCents < 0) {
      return { success: false, error: 'Price cannot be negative' }
    }

    const { error } = await supabase
      .from('courses')
      .update({
        price_cents: priceCents,
        currency: currency.toLowerCase(),
        seat_limit: seatLimit,
      })
      .eq('id', courseId)
      .eq('org_id', profile.org_id)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/courses/${courseId}`)
    revalidatePath(`/admin/courses/${courseId}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update course pricing' }
  }
}

export async function createCoursePurchaseCheckout({
  courseId,
  origin,
}: {
  courseId: string
  origin: string
}): Promise<{ success: boolean; url?: string | null; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let buyerUid: string | null = null
    let buyerEmail: string | null = null

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('uid, email')
        .eq('auth_id', user.id)
        .single()
      buyerUid = profile?.uid || null
      buyerEmail = profile?.email || user.email || null
    }

    // Fetch course details & org Stripe Connect status
    const svc = createServiceClient()
    const { data: course, error: courseErr } = await svc
      .from('courses')
      .select('id, title, price_cents, currency, seat_limit, org_id, organizations(stripe_connect_id, stripe_connect_status)')
      .eq('id', courseId)
      .single()

    if (courseErr || !course) {
      return { success: false, error: 'Course not found' }
    }

    if (!course.price_cents || course.price_cents <= 0) {
      return { success: false, error: 'This course is free and does not require checkout' }
    }

    // Check seat limit if set
    if (course.seat_limit && course.seat_limit > 0) {
      const { count } = await svc
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', courseId)
        .eq('status', 'active')

      if (count && count >= course.seat_limit) {
        return { success: false, error: 'This course has reached maximum seat capacity' }
      }
    }

    const org = course.organizations as any
    const stripeConnectId = org?.stripe_connect_id || null

    const session = await createCourseCheckoutSession({
      courseId: course.id,
      courseTitle: course.title,
      priceCents: course.price_cents,
      currency: course.currency || 'usd',
      orgId: course.org_id,
      stripeConnectId,
      buyerUid,
      buyerEmail,
      successUrl: `${origin}/courses/${courseId}?purchased=true`,
      cancelUrl: `${origin}/courses/${courseId}?canceled=true`,
    })

    // Pre-record pending purchase
    await svc.from('course_purchases').insert({
      org_id: course.org_id,
      course_id: course.id,
      buyer_uid: buyerUid,
      buyer_email: buyerEmail || 'guest@churchcore.org',
      stripe_checkout_session_id: session.sessionId,
      amount_cents: course.price_cents,
      currency: course.currency || 'usd',
      status: 'pending',
    })

    return { success: true, url: session.url }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create checkout session' }
  }
}
