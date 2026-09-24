// Reserved, never-deliverable domains (RFC 2606 / RFC 6761). The production
// synthetic-test tenant uses @synthetic.churchcore.invalid accounts; nothing
// may ever be sent to them, whichever code path triggers a notification.
const UNDELIVERABLE_TLDS = ['.invalid', '.test', '.example', '.localhost']

export function isDeliverableAddress(email: string | null | undefined): email is string {
  if (!email) return false
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  if (!domain) return false
  return !UNDELIVERABLE_TLDS.some((tld) => domain === tld.slice(1) || domain.endsWith(tld))
}
