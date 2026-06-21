import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest) {
  // Auth — org admin only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Fetch stripe_customer_id via service client — bypasses RLS safely, server-side only
  const svc = createServiceClient()
  const { data: org } = await svc
    .from('organizations')
    .select('stripe_customer_id, status')
    .eq('id', profile.org_id)
    .single()

  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   org.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch {
    return NextResponse.json({ error: 'Could not open billing portal. Please try again.' }, { status: 500 })
  }
}
