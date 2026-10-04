import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, AppState, BackHandler, KeyboardAvoidingView, Platform, Pressable,
  Text, View,
} from 'react-native'
import { useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ApiError, clearSession, loadSession, Session, setSessionExpiredHandler, signIn, uploadImage } from './src/api'
import { Draft, isLocalPhoto, persistPhoto, readDrafts, removeUnusedDraftPhotos, writeDrafts } from './src/storage'
import { colors } from './src/theme'
import { loadCatalog, lookupBarcode, searchErrorMessage, searchTemplates } from './src/data/catalog'
import { listContributionStatuses, submitContribution } from './src/data/contributions'
import { styles } from './src/components/styles'
import { Mark } from './src/components/ui'
import { manualCodeError, scanGtin, validGtin } from './src/domain/barcode'
import { CatalogItem, makeProduct, Template } from './src/domain/catalog'
import { LoginScreen } from './src/screens/LoginScreen'
import { HomeScreen } from './src/screens/HomeScreen'
import { ScanScreen } from './src/screens/ScanScreen'
import { AssignScreen } from './src/screens/AssignScreen'
import { ProductWizardScreen } from './src/screens/ProductWizardScreen'

type Screen = 'home' | 'scan' | 'assign' | 'wizard'
type ScanTarget = 'lookup' | 'variant'

const freshId = () => `sahim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

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
  const [manualError, setManualError] = useState('')
  const [scannedCode, setScannedCode] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Template[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [editingBarcodeId, setEditingBarcodeId] = useState('')
  const [replacingErrorId, setReplacingErrorId] = useState('')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
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
  const searchRequest = useRef(0)

  async function persist(items: Draft[]) {
    const previous = draftsRef.current
    draftsRef.current = items
    setDrafts(items)
    try {
      if (sessionRef.current) await writeDrafts(sessionRef.current.user.id, items)
    } catch (error) {
      if (draftsRef.current === items) { draftsRef.current = previous; setDrafts(previous) }
      throw error
    }
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

  async function refreshCatalog() {
    const owner = sessionRef.current
    const epoch = sessionEpoch.current
    if (!owner) return
    setCatalogLoading(true)
    try {
      const items = await loadCatalog(owner)
      if (epoch === sessionEpoch.current) { setCatalog(items); setCatalogError('') }
    } catch (error) {
      if (epoch === sessionEpoch.current && !(error instanceof ApiError && error.kind === 'auth'))
        setCatalogError(error instanceof Error ? error.message : 'Catalog unavailable')
    } finally {
      if (epoch === sessionEpoch.current) setCatalogLoading(false)
    }
  }

  useEffect(() => {
    if (session) void refreshCatalog()
  }, [session?.user.id])

  useEffect(() => setSessionExpiredHandler(() => {
    if (!sessionRef.current) return
    void logout().then(() => message('Your session ended. Sign in again.'))
  }), [])

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
          const status = await submitContribution(owner, item, input)
          if (!active()) return
          await persist(draftsRef.current.map((entry) => entry.localId === item.localId ? { ...entry, input, status, message: '' } : entry))
        } catch (error) {
          if (!active()) return
          if (error instanceof ApiError && (error.retryable || error.kind === 'auth')) break
          await persist(draftsRef.current.map((entry) => entry.localId === item.localId ? { ...entry, status: 'error', message: error instanceof Error ? error.message : 'Could not submit' } : entry))
        }
      }
      if (!active()) return
      const statuses = await listContributionStatuses(owner)
      if (!active()) return
      await persist(draftsRef.current.map((item) => {
        const remote = statuses.find((entry) => entry.localId === item.localId)
        return remote ? { ...item, status: remote.status.toLowerCase() as Draft['status'], message: remote.reviewNote || '' } : item
      }))
    } catch (error) {
      if (active() && !(error instanceof ApiError && (error.retryable || error.kind === 'auth'))) message(error instanceof Error ? error.message : 'Sync failed')
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
    if (draftsRef.current.some((item) => item.status === 'queued')) message('Queued work remains on this device for your next sign in.')
    sessionEpoch.current += 1
    sessionRef.current = null
    syncLock.current = null
    setSyncing(false)
    setLookupLoading(false)
    setBusy(false)
    scanLock.current = false
    try { await clearSession() } catch { message('Could not clear saved credentials on this device.') }
    setSession(null)
    setDrafts([])
    draftsRef.current = []
    setCatalog([])
    setCatalogError('')
    setCatalogLoading(false)
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

  function confirmDeleteDraft(item: Draft) {
    if (item.status !== 'draft' && item.status !== 'error') return
    Alert.alert('Delete local draft?', 'This work will be removed from this device. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteDraft(item.localId) },
    ])
  }

  async function deleteDraft(localId: string) {
    const item = draftsRef.current.find((entry) => entry.localId === localId)
    if (!item || (item.status !== 'draft' && item.status !== 'error')) return message('This item can no longer be deleted.')
    try {
      const remaining = draftsRef.current.filter((entry) => entry.localId !== localId)
      await persist(remaining)
      void removeUnusedDraftPhotos(item, remaining)
      message('Draft deleted from this device.')
    } catch { message('Could not delete the draft. Please try again.') }
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

  async function onCode(raw: string, source: 'scan' | 'manual' = 'scan') {
    if (source === 'scan' && (scanLock.current || manualCode.trim())) return
    if (source === 'manual' && lookupLoading) return
    if (source === 'manual') {
      const error = manualCodeError(raw)
      if (error) { setManualError(error); return }
    }
    scanLock.current = true
    const code = scanGtin(raw)
    if (!code) { message('This scan is not a valid EAN, UPC, or GTIN. Try entering the digits.'); setTimeout(() => { scanLock.current = false }, 1400); return }
    setManualError('')
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
        const existing = await lookupBarcode(session, code)
        if (epoch !== sessionEpoch.current) return
        if (existing) {
          message(`Already assigned to ${existing.product.name} / ${existing.name || 'Default'}`)
          setScreen('home')
        }
      }
    } catch (error) { if (epoch === sessionEpoch.current && !(error instanceof ApiError && error.offline)) message(error instanceof Error ? error.message : 'Lookup unavailable') }
    finally { if (epoch === sessionEpoch.current) { scanLock.current = false; setLookupLoading(false) } }
  }

  useEffect(() => {
    const requestId = ++searchRequest.current
    const term = search.trim()
    setResults([])
    setSearchError('')
    if (screen !== 'assign' || !session || lookupLoading || term.length < 2) {
      setSearching(false)
      return
    }
    const epoch = sessionEpoch.current
    setSearching(true)
    const timer = setTimeout(() => {
      void searchTemplates(session, term).then((matches) => {
        if (requestId === searchRequest.current && epoch === sessionEpoch.current) setResults(matches)
      }).catch((error) => {
        if (requestId === searchRequest.current && epoch === sessionEpoch.current) setSearchError(searchErrorMessage(error))
      }).finally(() => {
        if (requestId === searchRequest.current && epoch === sessionEpoch.current) setSearching(false)
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [search, screen, lookupLoading, session?.user.id])

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

  function advanceProduct() {
    if (step === 0 && !product.categoryId) return message('Choose a category to continue.')
    if (step === 1 && (!product.name.trim() || !product.image)) return message('Add a name and package photo.')
    if (step === 2 && product.variants.some((variant) => !variant.name.trim() || !variant.tags.trim() || (variant.barcode && !validGtin(variant.barcode)))) return message('Each variant needs a name and tags. Check barcode digits.')
    if (step < 3) return setStep(step + 1)
    void queue('PRODUCT', { name: product.name.trim(), nameAr: product.nameAr.trim(), categoryId: product.categoryId, productTypeId: product.productTypeId || undefined, brandId: product.brandId || undefined, image: product.image, variants: product.variants.map((variant) => ({ name: variant.name.trim(), tags: variant.tags.split(',').map((tag) => tag.trim()).filter(Boolean), sku: variant.sku.trim() || undefined, barcode: variant.barcode.trim() || undefined, image: variant.image || undefined })) }, wizardId)
  }

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar style="dark" />
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      {booting ? <View style={styles.center}><ActivityIndicator color={colors.green} /></View> : !session ? <LoginScreen email={email} password={password} busy={busy} notice={notice} onEmailChange={setEmail} onPasswordChange={setPassword} onSignIn={() => void login()} /> : <>
        <View style={styles.header}><View style={styles.brand}><Mark size={32} /><Text style={styles.brandName}>Sahim</Text></View><Pressable accessibilityRole="button" hitSlop={10} onPress={() => { if (screen === 'home') void logout(); else if (screen === 'wizard') void saveProductDraft(); else { if (screen === 'assign') { setEditingBarcodeId(''); setReplacingErrorId('') }; setScreen(scanTarget === 'variant' && screen === 'scan' ? 'wizard' : 'home') } }}><Text style={styles.headerAction}>{screen === 'home' ? 'Sign out' : screen === 'wizard' ? 'Save & close' : 'Back'}</Text></Pressable></View>
        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        {screen === 'home' ? <HomeScreen drafts={drafts} syncing={syncing} onScan={() => { setEditingBarcodeId(''); setReplacingErrorId(''); setScanTarget('lookup'); setScreen('scan') }} onAddProduct={() => startProduct()} onSync={() => void syncNow()} onResume={resumeProduct} onEditError={(item) => void editFailedItem(item)} onDeleteDraft={confirmDeleteDraft} /> : null}
        {screen === 'scan' ? <ScanScreen cameraGranted={Boolean(cameraPermission?.granted)} torch={torch} manualCode={manualCode} manualError={manualError} lookupLoading={lookupLoading} onAllowCamera={() => void requestCameraPermission()} onTorchChange={() => setTorch(!torch)} onManualCodeChange={(value) => { setManualCode(value); setManualError('') }} onScannedCode={(value) => void onCode(value)} onManualSubmit={() => void onCode(manualCode, 'manual')} /> : null}
        {screen === 'assign' ? <AssignScreen code={scannedCode} lookupLoading={lookupLoading} busy={busy} searching={searching} searchError={searchError} search={search} results={results} onSearchChange={setSearch} onSelectVariant={(id) => void selectVariant(id)} onAddProduct={() => startProduct(scannedCode)} /> : null}
        {screen === 'wizard' ? <ProductWizardScreen catalog={catalog} catalogLoading={catalogLoading} catalogError={catalogError} onRetryCatalog={() => void refreshCatalog()} product={product} setProduct={setProduct} step={step} setStep={setStep} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} brandFilter={brandFilter} setBrandFilter={setBrandFilter} onPickPhoto={() => void pickPhoto()} onPickVariantPhoto={(index) => void pickVariantPhoto(index)} onScanVariant={(index) => { setScanTarget('variant'); setScanVariantIndex(index); setScreen('scan') }} onSaveDraft={() => void saveProductDraft()} onContinue={advanceProduct} /> : null}
      </>}
    </View>
  </KeyboardAvoidingView>
}

export default function App() { return <SafeAreaProvider><Sahim /></SafeAreaProvider> }
