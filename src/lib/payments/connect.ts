import { getStripe } from '@/lib/stripe'
import type { StripeConnectStatus } from './types'

export async function createStripeConnectAccountLink({
  orgId,
  orgName,
  existingAccountId,
  returnUrl,
  refreshUrl,
}: {
  orgId: string
  orgName?: string
  existingAccountId?: string | null
  returnUrl: string
  refreshUrl: string
}): Promise<{ accountId: string; url: string }> {
  const stripe = getStripe()
  let accountId = existingAccountId

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'standard',
      metadata: { org_id: orgId },
      business_profile: {
        name: orgName || 'ChurchCore LMS Academy',
      },
    })
    accountId = account.id
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })

  return {
    accountId,
    url: accountLink.url,
  }
}

export async function getStripeConnectAccountStatus(accountId: string): Promise<{
  status: StripeConnectStatus
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
}> {
  try {
    const stripe = getStripe()
    const account = await stripe.accounts.retrieve(accountId)

    let status: StripeConnectStatus = 'pending'
    if (account.charges_enabled && account.payouts_enabled) {
      status = 'active'
    } else if (account.requirements?.disabled_reason) {
      status = 'restricted'
    } else if (!account.details_submitted) {
      status = 'pending'
    }

    return {
      status,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
    }
  } catch (err) {
    console.error('Failed to retrieve Stripe Connect account:', err)
    return {
      status: 'not_connected',
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    }
  }
}
