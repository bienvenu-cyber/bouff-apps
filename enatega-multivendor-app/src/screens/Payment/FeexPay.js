import React, { useContext, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import ThemeContext from '../../ui/ThemeContext/ThemeContext'
import { theme } from '../../utils/themeColors'
import TextDefault from '../../components/Text/TextDefault/TextDefault'
import PaymentFields from '../../bouff/PaymentFields'
import { invokePayment, cancelPaymentOrder } from '../../bouff/payments'
import { paymentState, startPayload } from '../../bouff/paymentLogic'

export default function FeexPay({ route, navigation }) {
  const { order, initialPayment } = route.params
  const currentTheme = theme[useContext(ThemeContext).ThemeValue]
  const [choice, setChoice] = useState(initialPayment || { method: order.paymentMethod === 'CARD' ? 'card' : 'momo', payerPhone: order.user?.phone || '', email: order.user?.email || '' })
  const [snapshot, setSnapshot] = useState({ orderStatus: 'awaiting_payment', deadline: order.paymentDeadline })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [now, setNow] = useState(Date.now())
  const lock = useRef(false)
  const polling = useRef(false)
  const alive = useRef(true)
  const done = useRef(false)
  const started = useRef(false)
  const snapshotRef = useRef(snapshot)
  const identity = { orderNumber: order.orderId, customerPhone: order.user?.phone }
  function accept(data) {
    if (!alive.current || done.current) return
    snapshotRef.current = data
    setSnapshot(data)
    if (paymentState(data) === 'success') {
      done.current = true
      setMessage('Paiement confirmé, votre commande part en cuisine')
      navigation.replace('OrderDetail', { _id: order._id })
    }
  }
  async function poll() {
    if (polling.current || done.current || !alive.current) return
    polling.current = true
    try {
      const data = await invokePayment({ action: 'status', ...identity })
      if (alive.current) { setError(''); accept(data) }
      return data
    } catch (e) { if (alive.current) setError(e.message) }
    finally { polling.current = false }
  }
  async function run(action) {
    if (lock.current || done.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try { await action() } catch (e) {
      if (alive.current) {
        if (e.code === 'PAYMENT_IN_PROGRESS') { setMessage(e.message); setEditing(false); await poll() }
        else { setError(e.message); await poll(); setError(e.message) }
      }
    } finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function start() {
    await run(async () => {
      const payload = startPayload({ ...choice, ...identity, firstName: order.user?.name || 'Client' })
      const data = await invokePayment(payload)
      if (!alive.current) return
      setEditing(false)
      setMessage(data.message || '')
      accept({ ...snapshotRef.current, ...data, payment: { status: data.status, reason: data.status === 'failed' ? data.message : null, paymentUrl: data.paymentUrl } })
      if (choice.method === 'card' && data.paymentUrl && !done.current) {
        await WebBrowser.openAuthSessionAsync(data.paymentUrl, 'thebouffapp://payment-result')
      }
      await poll()
    })
  }
  useEffect(() => {
    alive.current = true
    void (async () => {
      const data = await poll()
      if (!alive.current || !data || paymentState(data) !== 'waiting') return
      if (initialPayment && !data.payment && !started.current) { started.current = true; await start() }
    })()
    const timer = setInterval(() => { if (snapshotRef.current.orderStatus === 'awaiting_payment') void poll() }, 4000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { alive.current = false; clearInterval(timer); clearInterval(clock) }
  }, [])
  const state = paymentState(snapshot)
  const pending = snapshot.payment?.status === 'pending'
  const deadline = Date.parse(snapshot.deadline)
  const seconds = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null
  const action = (label, onPress, disabled = busy) => <TouchableOpacity key={label} accessibilityRole='button' accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ padding: 16, backgroundColor: '#FF7A1A', borderRadius: 10, opacity: disabled ? 0.5 : 1 }}><TextDefault bold textColor='#000000'>{label}</TextDefault></TouchableOpacity>
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16, backgroundColor: currentTheme.newheaderBG, flexGrow: 1 }}>
    <TextDefault H3 bold textColor={currentTheme.colors.textPrimary}>Paiement en attente</TextDefault>
    <TextDefault textColor={currentTheme.colors.textPrimary}>{order.orderId} · {order.orderAmount} FCFA</TextDefault>
    <TextDefault textColor={currentTheme.colors.textPrimary}>{choice.method === 'card' ? 'Carte bancaire' : 'Mobile Money'}</TextDefault>
    {seconds !== null && <TextDefault textColor={currentTheme.colors.textPrimary}>{seconds > 0 ? `Temps restant : ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Délai atteint, vérification du paiement…'}</TextDefault>}
    {state === 'cancelled' ? <>
      <TextDefault textColor={currentTheme.colors.textPrimary}>Paiement non reçu à temps, commande annulée</TextDefault>
      <TextDefault textColor={currentTheme.colors.textPrimary}>Si vous avez été débité, contactez BOUFF au 01 65 40 90 59 : le montant sera vérifié.</TextDefault>
      {action('Retour au menu', () => navigation.popToTop(), false)}
    </> : <>
      {!!message && <TextDefault textColor={currentTheme.colors.textPrimary}>{message}</TextDefault>}
      {pending && <><ActivityIndicator color='#FF7A1A' /><TextDefault textColor={currentTheme.colors.textPrimary}>{choice.method === 'momo' ? `Validez le paiement sur votre téléphone (${({ mtn: 'MTN', moov: 'Moov', celtiis: 'Celtiis' })[choice.network] || 'Mobile Money'}). Ne communiquez jamais votre code secret.` : 'Paiement en cours de validation.'}</TextDefault></>}
      {state === 'failed' && <TextDefault textColor={currentTheme.colors.textPrimary}>{snapshot.payment?.reason || 'Le paiement a échoué.'}</TextDefault>}
      {!!error && <TextDefault textColor={currentTheme.colors.textPrimary}>{error}</TextDefault>}
      {!!error && action('Réessayer la connexion', () => run(poll))}
      {editing && <PaymentFields value={choice} onChange={setChoice} disabled={busy} theme={currentTheme} onlineOnly />}
      {!pending && (seconds === null || seconds > 0) && <>
        {action(state === 'failed' ? 'Réessayer' : 'Payer maintenant', start)}
        {action('Changer de moyen de paiement', () => setEditing(true))}
      </>}
      {pending && choice.method === 'card' && snapshot.payment?.paymentUrl && action('Ouvrir la page de paiement', () => run(async () => { await WebBrowser.openAuthSessionAsync(snapshot.payment.paymentUrl, 'thebouffapp://payment-result'); await poll() }))}
      {action('Annuler la commande', () => run(async () => { await cancelPaymentOrder(identity.orderNumber, identity.customerPhone); await poll() }))}
    </>}
  </ScrollView>
}
