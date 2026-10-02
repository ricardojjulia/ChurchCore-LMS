import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateKeyPairSync } from 'node:crypto'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: connection } = await supabase
      .from('churchcore_connections')
      .select('*')
      .eq('org_id', profile.org_id)
      .neq('status', 'revoked')
      .maybeSingle()

    return NextResponse.json({ connection: connection || null })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const body = await req.json()
    const { churchRef, connectUrl, theirPublicKey, theirKeyId, autoApply } = body

    if (!churchRef || !connectUrl || !theirPublicKey || !theirKeyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Generate our LMS Ed25519 key ID if new
    const ourKeyId = `lms-${profile.org_id.slice(0, 8)}-${Date.now().toString(36)}`

    // Generate ephemeral public key pair to display to admin for ChurchCore configuration
    const { publicKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    const { data: connection, error: saveErr } = await supabase
      .from('churchcore_connections')
      .upsert(
        {
          org_id: profile.org_id,
          church_ref: churchRef.trim(),
          connect_url: connectUrl.trim(),
          their_public_key: theirPublicKey.trim(),
          their_key_id: theirKeyId.trim(),
          our_key_id: ourKeyId,
          status: 'connected',
          auto_apply: Boolean(autoApply),
          created_by: profile.uid,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id' }
      )
      .select()
      .single()

    if (saveErr) {
      return NextResponse.json({ error: saveErr.message }, { status: 500 })
    }

    return NextResponse.json({
      connection,
      ourPublicKey: publicKey,
      ourKeyId,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    await supabase
      .from('churchcore_connections')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('org_id', profile.org_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
