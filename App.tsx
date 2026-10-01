import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, AppState, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path, Rect } from 'react-native-svg'
import { ApiError, API_URL_CONFIGURED, clearSession, loadSession, request, Session, signIn, uploadImage } from './src/api'
import { Draft, isLocalPhoto, persistPhoto, readDrafts, writeDrafts } from './src/storage'
import { colors } from './src/theme'

type CatalogItem = { id: number; name: string; categories: { categories: Category[] }; brands: { brands: Brand[] } }
type Category = { id: number; name: string; productTypes: { productTypes: { id: number; name: string }[] } }
type Brand = { id: number; name: string }
type Template = { id: number; name: string; variants: { id: number; name: string | null; barcode: string | null }[] }
type Screen = 'home' | 'scan' | 'assign' | 'wizard'
type ScanTarget = 'lookup' | 'variant'

const freshId = () => `sahim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
const makeProduct = (barcode = '') => ({ nicheId: 0, categoryId: 0, productTypeId: 0, brandId: 0, name: '', nameAr: '', image: '', variants: [{ name: '', tags: '', sku: '', barcode, image: '' }] })

function validGtin(raw: string) {
  const value = raw.trim()
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = value.split('').map(Number)
  const check = digits.pop()!
  return (10 - digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0) % 10) % 10 === check
}

function scanGtin(raw: string) {
  const value = raw.trim()
  if (validGtin(value)) return value
  const gs1 = value.match(/(?:^\(01\)|\/01\/)(\d{14})(?:$|[/?#])/)
  return gs1 && validGtin(gs1[1]) ? gs1[1] : ''
}

function Mark({ size = 40 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Rect x="3" y="3" width="42" height="42" rx="14" fill={colors.green} />
    <Path d="M14 17c3-4 13-6 20-2M34 31c-3 4-13 6-20 2M17 15l17 18" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    <Path d="M11 10v7M10 11h7M37 31v7M31 37h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </Svg>
}

function ScanSymbol() {
  return <Svg width={64} height={64} viewBox="0 0 64 64" fill="none">
    <Path d="M10 22V10h12M42 10h12v12M54 42v12H42M22 54H10V42" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M20 25v14M26 21v22M33 25v14M39 21v22M45 25v14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
}

function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text></Pressable>
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: 'email-address' | 'default' | 'number-pad' }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} style={styles.input} /></View>
}

function Chip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{title}</Text></Pressable>
}

function Sahim() {
  const insets = useSafeAreaInsets()
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [screen, setScreen] = useState<Screen>('home')
  const [scanTarget, setScanTarget] = useState<ScanTarget>('lookup')
  const [scanVariantIndex, setScanVariantIndex] = useState(0)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [torch, setTorch] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [scannedCode, setScannedCode] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Template[]>([])
  const [editingBarcodeId, setEditingBarcodeId] = useState('')
  const [replacingErrorId, setReplacingErrorId] = useState('')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [product, setProduct] = useState(makeProduct())
  const [wizardId, setWizardId] = useState('')
  const [step, setStep] = useState(0)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const draftsRef = useRef<Draft[]>([])
  const sessionRef = useRef<Session | null>(null)
  const sessionEpoch = useRef(0)
  const syncLock = useRef<number | null>(null)
  const scanLock = useRef(false)

  async function persist(items: Draft[]) {
    draftsRef.current = items
    setDrafts(items)
    if (sessionRef.current) await writeDrafts(sessionRef.current.user.id, items)
  }

  function message(value: string) { setNotice(value); setTimeout(() => setNotice(''), 5000) }

  useEffect(() => {
    void loadSession().then(async (saved) => {
      if (saved) {
        const items = await readDrafts(saved.user.id)
        draftsRef.current = items
        setDrafts(items)
        sessionRef.current = saved
        setSession(saved)
      }
    }).catch(() => message('Could not restore your session. Sign in again.')).finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    if (!session) return
    let mounted = true
    request<{ findManyNiches: { niches: CatalogItem[] } }>(session,
      'query{findManyNiches(page:1,limit:100,isFull:true){niches{id name categories{categories{id name productTypes{productTypes{id name}}}} brands{brands{id name}}}}}',
    ).then(async (data) => {
      if (!mounted) return
      setCatalog(data.findManyNiches.niches)
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      await AsyncStorage.setItem(`sahim.catalog.${session.user.id}`, JSON.stringify(data.findManyNiches.niches))
    }).catch(async () => {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      const cached = await AsyncStorage.getItem(`sahim.catalog.${session.user.id}`)
      if (mounted && cached) setCatalog(JSON.parse(cached))
    })
    return () => { mounted = false }
  }, [session?.user.id])

  async function syncNow() {
    const owner = sessionRef.current
    const epoch = sessionEpoch.current
    if (!owner || syncLock.current === epoch) return
    const active = () => sessionEpoch.current === epoch && sessionRef.current?.user.id === owner.user.id
    syncLock.current = epoch
    setSyncing(true)
    try {
      for (const item of draftsRef.current.filter((entry) => entry.status === 'queued')) {
        if (!active()) return
        try {
          const input = JSON.parse(JSON.stringify(item.input))
          if (isLocalPhoto(input.image)) {
            input.image = await uploadImage(owner, input.image)
            if (!active()) return
            await persist(draftsRef.current.map((entry) => entry.localId === item.localId ? { ...entry, input } : entry))
          }
          if (input.variants) for (const variant of input.variants) if (isLocalPhoto(variant.image)) {
            variant.image = await uploadImage(owner, variant.image)
            if (!active()) return
            await persist(draftsRef.current.map((entry) => entry.localId === item.localId ? { ...entry, input } : entry))
          }
          const data = await request<{ submitSahimContribution: { status: string } }>(owner,
            'mutation($id:String!,$kind:String!,$input:String!){submitSahimContribution(localId:$id,kind:$kind,inputJson:$input){status}}',
            { id: item.localId, kind: item.kind, input: JSON.stringify(input) },
          )
          if (!active()) return
          await persist(draftsRef.current.map((entry) => entry.localId === item.localId ? { ...entry, input, status: data.submitSahimContribution.status.toLowerCase() as Draft['status'], message: '' } : entry))
        } catch (error) {
          if (!active()) return
          if (error instanceof ApiError && error.offline) break
          await persist(draftsRef.current.map((entry) => entry.localId === item.localId ? { ...entry, status: 'error', message: error instanceof Error ? error.message : 'Could not submit' } : entry))
        }
      }
      if (!active()) return
      const data = await request<{ mySahimContributions: { localId: string; status: string; reviewNote: string | null }[] }>(owner,
        'query{mySahimContributions{localId status reviewNote}}',
      )
      if (!active()) return
      await persist(draftsRef.current.map((item) => {
        const remote = data.mySahimContributions.find((entry) => entry.localId === item.localId)
        return remote ? { ...item, status: remote.status.toLowerCase() as Draft['status'], message: remote.reviewNote || '' } : item
      }))
    } catch (error) {
      if (active() && !(error instanceof ApiError && error.offline)) message(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      if (syncLock.current === epoch) { syncLock.current = null; setSyncing(false) }
    }
  }

  useEffect(() => {
    if (!session) return
    void syncNow()
    const timer = setInterval(() => { void syncNow() }, 45000)
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void syncNow() })
    return () => { clearInterval(timer); subscription.remove() }
  }, [session?.user.id])

  useEffect(() => {
    if (!session || !wizardId || screen !== 'wizard') return
    const timer = setTimeout(() => {
      void persist(draftsRef.current.map((item) => item.localId === wizardId ? { ...item, input: product } : item)).catch(() => message('Could not save this draft on your device.'))
    }, 500)
    return () => clearTimeout(timer)
  }, [product, wizardId, screen])

  async function login() {
    setBusy(true)
    try {
      const next = await signIn(email.trim(), password)
      const items = await readDrafts(next.user.id)
      draftsRef.current = items
      setDrafts(items)
      sessionEpoch.current += 1
      sessionRef.current = next
      setLookupLoading(false)
      setBusy(false)
      scanLock.current = false
      setSession(next)
      setPassword('')
    } catch (error) { message(error instanceof Error ? error.message : 'Sign in failed') }
    finally { setBusy(false) }
  }

  async function logout() {
    if (drafts.some((item) => item.status === 'queued')) message('Queued work remains on this device for your next sign in.')
    sessionEpoch.current += 1
    sessionRef.current = null
    syncLock.current = null
    setSyncing(false)
    setLookupLoading(false)
    setBusy(false)
    scanLock.current = false
    await clearSession()
    setSession(null)
    setDrafts([])
    draftsRef.current = []
    setCatalog([])
    setScreen('home')
  }

  async function queue(kind: Draft['kind'], input: Record<string, any>, id = freshId()) {
    const item: Draft = { localId: id, kind, input, status: 'queued', createdAt: Date.now() }
    try { await persist([item, ...draftsRef.current.filter((entry) => entry.localId !== id && entry.localId !== replacingErrorId)]) }
    catch { message('Could not save on this device. Try again.'); return false }
    setScreen('home')
    setWizardId('')
    message('Saved on this device. Sahim will submit it when connected.')
    void syncNow()
    return true
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) { message('Allow camera access to photograph the package.'); return }
    const result = await ImagePicker.launchCameraAsync({ quality: .8, allowsEditing: false, mediaTypes: ['images'] })
    if (result.canceled) return
    try {
      const image = await persistPhoto(result.assets[0].uri)
      setProduct((current) => ({ ...current, image }))
    }
    catch { message('Could not save the photo on this device.') }
  }

  async function pickVariantPhoto(index: number) {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) { message('Allow camera access to photograph the variant.'); return }
    const result = await ImagePicker.launchCameraAsync({ quality: .8, mediaTypes: ['images'] })
    if (result.canceled) return
    try {
      const image = await persistPhoto(result.assets[0].uri)
      setProduct((current) => ({ ...current, variants: current.variants.map((variant, i) => i === index ? { ...variant, image } : variant) }))
    } catch { message('Could not save the variant photo on this device.') }
  }

  function startProduct(barcode = '') {
    setEditingBarcodeId('')
    setReplacingErrorId('')
    const id = freshId()
    const initial = makeProduct(barcode)
    setProduct(initial)
    setWizardId(id)
    setStep(0)
    setScreen('wizard')
    void persist([{ localId: id, kind: 'PRODUCT', status: 'draft', input: initial, createdAt: Date.now() }, ...draftsRef.current]).catch(() => message('Could not save this draft on your device.'))
  }

  function resumeProduct(item: Draft) {
    const input = item.input
    const nicheId = input.nicheId || catalog.find((niche) => niche.categories.categories.some((category) => category.id === input.categoryId))?.id || 0
    setProduct({ ...makeProduct(), ...input, nicheId, nameAr: input.nameAr || '', productTypeId: input.productTypeId || 0, brandId: input.brandId || 0,
      variants: (input.variants || []).map((variant: Record<string, any>) => ({ ...variant, tags: Array.isArray(variant.tags) ? variant.tags.join(', ') : variant.tags || '', sku: variant.sku || '', barcode: variant.barcode || '' })) })
    setWizardId(item.localId)
    setStep(0)
    setScreen('wizard')
  }

  async function saveProductDraft() {
    if (!wizardId) return
    try {
      await persist(draftsRef.current.map((item) => item.localId === wizardId ? { ...item, input: product } : item))
      setScreen('home')
    } catch { message('Could not save this draft on your device.') }
  }

  async function editFailedItem(item: Draft) {
    if (item.kind === 'PRODUCT') {
      const replacement: Draft = { ...item, localId: freshId(), status: 'draft', message: '' }
      try {
        await persist([replacement, ...draftsRef.current.filter((entry) => entry.localId !== item.localId)])
        resumeProduct(replacement)
      } catch { message('Could not save this draft on your device.') }
      return
    }
    setScannedCode(item.input.barcode || '')
    setEditingBarcodeId(freshId())
    setReplacingErrorId(item.localId)
    setResults([])
    setSearch('')
    setScreen('assign')
  }

  useEffect(() => {
    if (!session || screen === 'home') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'scan') setScreen(scanTarget === 'variant' ? 'wizard' : 'home')
      else if (screen === 'wizard' && step > 0) setStep(step - 1)
      else if (screen === 'wizard') void saveProductDraft()
      else { if (screen === 'assign') { setEditingBarcodeId(''); setReplacingErrorId('') }; setScreen('home') }
      return true
    })
    return () => subscription.remove()
  }, [session, screen, scanTarget, step, product, wizardId])

  async function onCode(raw: string) {
    if (scanLock.current) return
    scanLock.current = true
    const code = scanGtin(raw)
    if (!code) { message('Scan a valid product barcode, or enter its digits manually.'); setTimeout(() => { scanLock.current = false }, 1400); return }
    setScannedCode(code)
    setManualCode('')
    setResults([])
    setSearch('')
    setScreen(scanTarget === 'variant' ? 'wizard' : 'assign')
    if (scanTarget === 'variant') {
      setProduct((current) => ({ ...current, variants: current.variants.map((variant, index) => index === scanVariantIndex ? { ...variant, barcode: code } : variant) }))
      scanLock.current = false
      return
    }
    const epoch = sessionEpoch.current
    setLookupLoading(true)
    try {
      if (session) {
        const data = await request<{ sahimBarcodeLookup: { id: number; name: string | null; product: { name: string } } | null }>(session,
          'query($code:String!){sahimBarcodeLookup(barcode:$code){id name product{name}}}', { code },
        )
        if (epoch !== sessionEpoch.current) return
        if (data.sahimBarcodeLookup) {
          message(`Already assigned to ${data.sahimBarcodeLookup.product.name} / ${data.sahimBarcodeLookup.name || 'Default'}`)
          setScreen('home')
        }
      }
    } catch (error) { if (epoch === sessionEpoch.current && !(error instanceof ApiError && error.offline)) message(error instanceof Error ? error.message : 'Lookup unavailable') }
    finally { if (epoch === sessionEpoch.current) { scanLock.current = false; setLookupLoading(false) } }
  }

  async function searchProducts() {
    if (!session || !search.trim()) return
    const epoch = sessionEpoch.current
    const term = search.trim()
    setBusy(true)
    setResults([])
    try {
      const data = await request<{ findManyProductTemplates: { productTemplates: Template[] } }>(session,
        'query($search:String!){findManyProductTemplates(search:$search,page:1,limit:20){productTemplates{id name variants{id name barcode}}}}',
        { search: term },
      )
      if (epoch !== sessionEpoch.current) return
      setResults(data.findManyProductTemplates.productTemplates)
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      const key = `sahim.search.${session.user.id}`
      const previous: Template[] = JSON.parse((await AsyncStorage.getItem(key)) || '[]')
      const merged = new Map(previous.map((item) => [item.id, item]))
      for (const item of data.findManyProductTemplates.productTemplates) merged.set(item.id, item)
      await AsyncStorage.setItem(key, JSON.stringify([...merged.values()].slice(-500)))
    } catch (error) {
      if (epoch !== sessionEpoch.current) return
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
        const cached = await AsyncStorage.getItem(`sahim.search.${session.user.id}`)
        if (cached) setResults((JSON.parse(cached) as Template[]).filter((item) => item.name.toLowerCase().includes(term.toLowerCase())))
        else message(error instanceof Error ? error.message : 'Search unavailable')
      } catch { message(error instanceof Error ? error.message : 'Search unavailable') }
    } finally { if (epoch === sessionEpoch.current) setBusy(false) }
  }

  async function selectVariant(variantId: number) {
    if (lookupLoading || busy) return
    const epoch = sessionEpoch.current
    setBusy(true)
    try {
      const photoPermission = await ImagePicker.requestCameraPermissionsAsync()
      if (epoch !== sessionEpoch.current) return
      if (!photoPermission.granted) { message('A package photo is required for review.'); return }
      const photo = await ImagePicker.launchCameraAsync({ quality: .8, mediaTypes: ['images'] })
      if (epoch !== sessionEpoch.current || photo.canceled) return
      const image = await persistPhoto(photo.assets[0].uri)
      if (epoch !== sessionEpoch.current) return
      if (await queue('BARCODE', { variantId, barcode: scannedCode, image }, editingBarcodeId || undefined)) { setEditingBarcodeId(''); setReplacingErrorId('') }
    } catch { if (epoch === sessionEpoch.current) message('Could not save the package photo.') }
    finally { if (epoch === sessionEpoch.current) setBusy(false) }
  }

  const niche = catalog.find((item) => item.id === product.nicheId)
  const category = niche?.categories.categories.find((item) => item.id === product.categoryId)
  const firstVariant = product.variants[0]

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar style="dark" />
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      {booting ? <View style={styles.center}><ActivityIndicator color={colors.green} /></View> : !session ? <View style={styles.login}>
        <Mark size={64} /><Text style={styles.heroTitle}>Sahim</Text><Text style={styles.subtitle}>A better catalog starts with one good scan.</Text>
        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        {!API_URL_CONFIGURED ? <Text style={styles.warning}>Set EXPO_PUBLIC_API_URL before signing in.</Text> : null}
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
        <View style={styles.field}><Text style={styles.fieldLabel}>Password</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Your access code" placeholderTextColor={colors.muted} style={styles.input} /></View>
        <Button title={busy ? 'Signing in...' : 'Sign in'} onPress={() => void login()} disabled={busy || !email || !password || !API_URL_CONFIGURED} />
        <Text style={styles.note}>Contributor accounts are created by an administrator.</Text>
      </View> : <>
        <View style={styles.header}><View style={styles.brand}><Mark /><View><Text style={styles.brandName}>Sahim</Text><Text style={styles.brandCaption}>Catalog contributor</Text></View></View><Pressable onPress={() => { if (screen === 'home') void logout(); else if (screen === 'wizard') void saveProductDraft(); else { if (screen === 'assign') { setEditingBarcodeId(''); setReplacingErrorId('') }; setScreen(scanTarget === 'variant' && screen === 'scan' ? 'wizard' : 'home') } }}><Text style={styles.headerAction}>{screen === 'home' ? 'Sign out' : 'Close'}</Text></Pressable></View>
        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        {screen === 'home' ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Make every product findable.</Text><Text style={styles.subtitle}>Scan a package or add what is missing. Your work is reviewed before it goes live.</Text>
          <Pressable style={styles.scanCard} onPress={() => { setEditingBarcodeId(''); setReplacingErrorId(''); setScanTarget('lookup'); setScreen('scan') }}><ScanSymbol /><View><Text style={styles.scanCardTitle}>Scan a barcode</Text><Text style={styles.scanCardHint}>Find a product or assign its code</Text></View></Pressable>
          <Button title="Add a missing product" secondary onPress={() => startProduct()} />
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your work</Text><Pressable onPress={() => void syncNow()} disabled={syncing}><Text style={styles.link}>{syncing ? 'Syncing...' : 'Sync now'}</Text></Pressable></View>
          {!drafts.length ? <Text style={styles.empty}>No submissions yet. Start with a scan.</Text> : drafts.map((item) => <Pressable key={item.localId} style={styles.rowCard} onPress={() => item.status === 'draft' && item.kind === 'PRODUCT' ? resumeProduct(item) : item.status === 'error' ? void editFailedItem(item) : undefined}>
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.kind === 'BARCODE' ? item.input.barcode : item.input.name || 'Untitled product'}</Text><Text style={styles.rowHint}>{item.message || (item.status === 'queued' ? 'Saved on this device, waiting to sync' : item.status === 'draft' ? 'Draft saved on this device' : item.status === 'pending' ? 'Awaiting admin review' : item.status)}</Text>{item.status === 'error' ? <Text style={styles.link}>Review and correct</Text> : null}</View><Text style={[styles.status, item.status === 'approved' && styles.statusApproved, item.status === 'error' && styles.statusError]}>{item.status}</Text>
          </Pressable>)}
        </ScrollView> : null}
        {screen === 'scan' ? <View style={styles.scannerScreen}>
          <Text style={styles.title}>Scan the package</Text><Text style={styles.subtitle}>Hold the barcode inside the frame. QR codes containing a product number also work.</Text>
          <View style={styles.cameraBox}>{cameraPermission?.granted ? <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }} onBarcodeScanned={({ data }) => void onCode(data)} /> : <View style={styles.center}><Text style={styles.empty}>Camera access is needed to scan.</Text><Button title="Allow camera" onPress={() => void requestCameraPermission()} /></View>}<View pointerEvents="none" style={styles.scanFrame} /></View>
          <Button title={torch ? 'Turn torch off' : 'Turn torch on'} secondary onPress={() => setTorch(!torch)} />
          <Field label="Or enter barcode digits" value={manualCode} onChangeText={setManualCode} keyboardType="number-pad" placeholder="EAN, UPC or GTIN" />
          <Button title="Use this code" onPress={() => void onCode(manualCode)} disabled={!manualCode} />
        </View> : null}
        {screen === 'assign' ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={styles.eyebrow}>{lookupLoading ? 'CHECKING BARCODE' : 'BARCODE TO ASSIGN'}</Text><Text style={styles.title}>{scannedCode}</Text><Text style={styles.subtitle}>Find the exact product and variant. Only variants without a code can receive one.</Text>
          <Field label="Search products" value={search} onChangeText={setSearch} placeholder="Product name" /><Button title={busy ? 'Searching...' : 'Search catalog'} onPress={() => void searchProducts()} disabled={busy || lookupLoading || !search.trim()} />
          {results.map((item) => <View style={styles.rowCard} key={item.id}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.name}</Text>{item.variants.filter((variant) => !variant.barcode).map((variant) => <Pressable key={variant.id} disabled={lookupLoading || busy} onPress={() => void selectVariant(variant.id)} style={styles.variantPick}><Text style={styles.link}>{variant.name || 'Default variant'}  + Assign code</Text></Pressable>)}{item.variants.every((variant) => variant.barcode) ? <Text style={styles.rowHint}>All variants already have codes.</Text> : null}</View></View>)}
          <View style={styles.divider} /><Text style={styles.sectionTitle}>Product not listed?</Text><Button title="Create product with this code" secondary disabled={lookupLoading || busy} onPress={() => startProduct(scannedCode)} />
        </ScrollView> : null}
        {screen === 'wizard' ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={styles.eyebrow}>PRODUCT REQUEST - {step + 1} OF 4</Text><View style={styles.progress}><View style={[styles.progressFill, { width: `${(step + 1) * 25}%` }]} /></View>
          {step === 0 ? <><Text style={styles.title}>Where does it belong?</Text><Text style={styles.subtitle}>Choose a niche and category. Product type and brand are optional.</Text>{!catalog.length ? <Text style={styles.warning}>Connect once to load the catalog. Your draft is safe on this device.</Text> : null}<Text style={styles.fieldLabel}>Niche</Text><View style={styles.chips}>{catalog.map((item) => <Chip key={item.id} title={item.name} selected={product.nicheId === item.id} onPress={() => { setCategoryFilter(''); setBrandFilter(''); setProduct((current) => ({ ...current, nicheId: item.id, categoryId: 0, productTypeId: 0, brandId: 0 })) }} />)}</View>
            {niche ? <><Text style={styles.fieldLabel}>Category</Text>{niche.categories.categories.length > 8 ? <Field label="Find category" value={categoryFilter} onChangeText={setCategoryFilter} placeholder="Type a name" /> : null}<View style={styles.chips}>{niche.categories.categories.filter((item) => item.name.toLowerCase().includes(categoryFilter.toLowerCase()) || item.id === product.categoryId).map((item) => <Chip key={item.id} title={item.name} selected={product.categoryId === item.id} onPress={() => setProduct((current) => ({ ...current, categoryId: item.id, productTypeId: 0 }))} />)}</View></> : null}
            {category?.productTypes.productTypes.length ? <><Text style={styles.fieldLabel}>Product type (optional)</Text><View style={styles.chips}>{category.productTypes.productTypes.map((item) => <Chip key={item.id} title={item.name} selected={product.productTypeId === item.id} onPress={() => setProduct((current) => ({ ...current, productTypeId: current.productTypeId === item.id ? 0 : item.id }))} />)}</View></> : null}
            {niche?.brands.brands.length ? <><Text style={styles.fieldLabel}>Brand (optional)</Text>{niche.brands.brands.length > 8 ? <Field label="Find brand" value={brandFilter} onChangeText={setBrandFilter} placeholder="Type a name" /> : null}<View style={styles.chips}>{niche.brands.brands.filter((item) => item.name.toLowerCase().includes(brandFilter.toLowerCase()) || item.id === product.brandId).map((item) => <Chip key={item.id} title={item.name} selected={product.brandId === item.id} onPress={() => setProduct((current) => ({ ...current, brandId: current.brandId === item.id ? 0 : item.id }))} />)}</View></> : null}
          </> : null}
          {step === 1 ? <><Text style={styles.title}>Show the product.</Text><Text style={styles.subtitle}>A clear package photo helps the admin verify it.</Text><Field label="Product name" value={product.name} onChangeText={(name) => setProduct((current) => ({ ...current, name }))} placeholder="Name on the package" /><Field label="Arabic name (optional)" value={product.nameAr} onChangeText={(nameAr) => setProduct((current) => ({ ...current, nameAr }))} />
            <Pressable style={styles.photoBox} onPress={() => void pickPhoto()}>{product.image ? <Image source={{ uri: product.image }} style={styles.photo} /> : <Text style={styles.photoHint}>+ Photograph product</Text>}</Pressable>
          </> : null}
          {step === 2 ? <><Text style={styles.title}>Add variants.</Text><Text style={styles.subtitle}>Give each size or format a name and tags. Scan its barcode if available.</Text>{product.variants.map((variant, index) => <View style={styles.variantCard} key={index}><Text style={styles.fieldLabel}>Variant {index + 1}</Text><Field label="Name" value={variant.name} onChangeText={(name) => setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, name } : v) }))} placeholder="e.g. 250 ml" /><Field label="Tags, separated by commas" value={variant.tags} onChangeText={(tags) => setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, tags } : v) }))} placeholder="Size, scent, color" /><Field label="SKU (optional)" value={variant.sku} onChangeText={(sku) => setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, sku } : v) }))} /><Field label="Barcode (optional)" value={variant.barcode} onChangeText={(barcode) => setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, barcode } : v) }))} keyboardType="number-pad" />
              <Pressable onPress={() => { setScanTarget('variant'); setScanVariantIndex(index); setScreen('scan') }}><Text style={styles.link}>Scan barcode with camera</Text></Pressable><Pressable onPress={() => void pickVariantPhoto(index)} style={styles.variantPhotoAction}>{variant.image ? <Image source={{ uri: variant.image }} style={styles.variantPhoto} /> : null}<Text style={styles.link}>{variant.image ? 'Change variant photo' : 'Add variant photo (optional)'}</Text></Pressable>{product.variants.length > 1 ? <Pressable onPress={() => setProduct((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }))}><Text style={styles.danger}>Remove variant</Text></Pressable> : null}</View>)}<Button title="+ Add another variant" secondary onPress={() => setProduct((current) => ({ ...current, variants: [...current.variants, { name: '', tags: '', sku: '', barcode: '', image: '' }] }))} /></> : null}
          {step === 3 ? <><Text style={styles.title}>Ready for review.</Text><Text style={styles.subtitle}>Your submission is saved on this device first. It will appear in the catalog only after admin approval.</Text><View style={styles.summary}><Text style={styles.rowTitle}>{product.name}</Text><Text style={styles.rowHint}>{niche?.name} / {category?.name}</Text><Text style={styles.rowHint}>{product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}</Text>{product.image ? <Image source={{ uri: product.image }} style={styles.summaryImage} /> : null}</View></> : null}
          <View style={styles.wizardActions}>{step > 0 ? <Button title="Back" secondary onPress={() => setStep(step - 1)} /> : <Button title="Save draft" secondary onPress={() => void saveProductDraft()} />}
            <Button title={step === 3 ? 'Submit for review' : 'Continue'} onPress={() => {
              if (step === 0 && !product.categoryId) return message('Choose a category to continue.')
              if (step === 1 && (!product.name.trim() || !product.image)) return message('Add a name and package photo.')
              if (step === 2 && product.variants.some((variant) => !variant.name.trim() || !variant.tags.trim() || (variant.barcode && !validGtin(variant.barcode)))) return message('Each variant needs a name and tags. Check barcode digits.')
              if (step < 3) setStep(step + 1)
              else void queue('PRODUCT', { name: product.name.trim(), nameAr: product.nameAr.trim(), categoryId: product.categoryId, productTypeId: product.productTypeId || undefined, brandId: product.brandId || undefined, image: product.image, variants: product.variants.map((variant) => ({ name: variant.name.trim(), tags: variant.tags.split(',').map((tag) => tag.trim()).filter(Boolean), sku: variant.sku.trim() || undefined, barcode: variant.barcode.trim() || undefined, image: variant.image || undefined })) }, wizardId)
            }} /></View>
        </ScrollView> : null}
      </>}
    </View>
  </KeyboardAvoidingView>
}

export default function App() { return <SafeAreaProvider><Sahim /></SafeAreaProvider> }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  login: { flex: 1, paddingHorizontal: 26, justifyContent: 'center', gap: 12, maxWidth: 500, width: '100%', alignSelf: 'center' },
  heroTitle: { fontSize: 40, fontWeight: '800', color: colors.ink, letterSpacing: -1.5 },
  header: { paddingHorizontal: 22, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandName: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -.6 }, brandCaption: { fontSize: 11, color: colors.muted }, headerAction: { color: colors.green, fontWeight: '700', padding: 8 },
  notice: { marginHorizontal: 22, padding: 12, borderRadius: 12, backgroundColor: colors.pale }, noticeText: { color: colors.greenDark, fontSize: 13 },
  content: { paddingHorizontal: 22, paddingBottom: 32, gap: 16, maxWidth: 620, width: '100%', alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing: -.4 }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.green, letterSpacing: 1.4 }, note: { color: colors.muted, fontSize: 12, textAlign: 'center' }, warning: { color: colors.danger, fontSize: 13 },
  button: { minHeight: 50, borderRadius: 14, paddingHorizontal: 18, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }, buttonSecondary: { backgroundColor: colors.pale }, buttonText: { fontSize: 15, fontWeight: '800', color: '#fff' }, buttonTextSecondary: { color: colors.greenDark }, disabled: { opacity: .45 },
  field: { gap: 6 }, fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 5 }, input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 15, color: colors.ink },
  scanCard: { backgroundColor: colors.green, borderRadius: 18, padding: 18, flexDirection: 'row', gap: 16, alignItems: 'center', minHeight: 108 }, scanCardTitle: { fontSize: 18, fontWeight: '700', color: '#fff' }, scanCardHint: { fontSize: 13, color: '#E0F5E5', marginTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }, sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.ink }, link: { color: colors.green, fontWeight: '700', fontSize: 13 }, empty: { color: colors.muted, fontSize: 14, paddingVertical: 18 },
  rowCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }, rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink }, rowHint: { fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 18 }, status: { fontSize: 11, color: colors.warning, fontWeight: '800', textTransform: 'capitalize' }, statusApproved: { color: colors.green }, statusError: { color: colors.danger },
  scannerScreen: { flex: 1, paddingHorizontal: 22, gap: 13 }, cameraBox: { flex: 1, overflow: 'hidden', borderRadius: 20, backgroundColor: colors.ink }, scanFrame: { width: '78%', height: 150, borderWidth: 2, borderColor: '#fff', borderRadius: 16, alignSelf: 'center', position: 'absolute', top: '38%' },
  variantPick: { paddingTop: 13, paddingBottom: 5 }, divider: { height: 1, backgroundColor: colors.line, marginVertical: 8 }, progress: { height: 4, backgroundColor: colors.line, borderRadius: 3 }, progressFill: { height: 4, borderRadius: 3, backgroundColor: colors.green },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line }, chipSelected: { backgroundColor: colors.pale, borderColor: colors.green }, chipText: { fontSize: 13, color: colors.ink }, chipTextSelected: { color: colors.greenDark, fontWeight: '800' },
  photoBox: { height: 190, borderRadius: 18, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, photo: { width: '100%', height: '100%' }, photoHint: { color: colors.green, fontWeight: '800' },
  variantCard: { padding: 16, borderRadius: 18, backgroundColor: colors.surface, gap: 12 }, danger: { color: colors.danger, fontSize: 13, paddingVertical: 5 }, summary: { padding: 18, borderRadius: 18, backgroundColor: colors.surface, gap: 5 }, summaryImage: { width: 90, height: 90, borderRadius: 10, marginTop: 10 }, wizardActions: { gap: 9, marginTop: 8 },
  variantPhotoAction: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }, variantPhoto: { width: 42, height: 42, borderRadius: 8 },
})
