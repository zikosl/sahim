import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL || ''
const ACCESS_KEY = 'sahim.access'
const REFRESH_KEY = 'sahim.refresh'
let sessionVersion = 0
let sessionWrite = Promise.resolve()
let refreshInFlight: Promise<Session> | null = null
let sessionExpiredHandler: (() => void) | null = null

export type Session = { user: { id: number; role: string }; accessToken: string; refreshToken: string }

export class ApiError extends Error {
  constructor(message: string, readonly offline = false, readonly kind: 'auth' | 'retryable' | 'request' = 'request', readonly code?: string) { super(message) }
  get retryable() { return this.offline || this.kind === 'retryable' }
}

export function setSessionExpiredHandler(handler: () => void) {
  sessionExpiredHandler = handler
  return () => { if (sessionExpiredHandler === handler) sessionExpiredHandler = null }
}

async function readGraphQLResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  const error = body?.errors?.[0]
  if (error || !response.ok) {
    const code = error?.extensions?.code
    const auth = response.status === 401 || code === 'UNAUTHENTICATED'
    const retryable = response.status === 429 || response.status >= 500 || code === 'RATE_LIMITED' || code === 'INTERNAL_SERVER_ERROR'
    throw new ApiError(error?.message || `Server unavailable (${response.status})`, false, auth ? 'auth' : retryable ? 'retryable' : 'request', code)
  }
  if (!body?.data) throw new ApiError('Server returned an invalid response', false, 'retryable')
  return body.data as T
}

async function rawRequest<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  if (!/^https:\/\//.test(API_URL) && !__DEV__) throw new ApiError('Configure a secure API URL before release')
  let response: Response
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    response = await fetch(API_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ query, variables, operationName: query.match(/^\s*(?:query|mutation)\s+([_A-Za-z][_0-9A-Za-z]*)/)?.[1] }), signal: controller.signal,
    })
  } catch { throw new ApiError('No connection. Your work is saved on this device.', true) }
  finally { clearTimeout(timeout) }
  return readGraphQLResponse<T>(response)
}

export async function saveSession(session: Session, expectedVersion = sessionVersion) {
  sessionWrite = sessionWrite.catch(() => undefined).then(async () => {
    if (expectedVersion !== sessionVersion) throw new ApiError('Session changed')
    await SecureStore.setItemAsync(ACCESS_KEY, session.accessToken)
    await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken)
    await SecureStore.setItemAsync('sahim.user', JSON.stringify(session.user))
  })
  await sessionWrite
}

export async function loadSession(): Promise<Session | null> {
  const [accessToken, refreshToken, userJson] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY), SecureStore.getItemAsync(REFRESH_KEY), SecureStore.getItemAsync('sahim.user'),
  ])
  if (!accessToken || !refreshToken || !userJson) return null
  const user = JSON.parse(userJson)
  return user.role === 'CONTRIBUTOR' ? { accessToken, refreshToken, user } : null
}

export async function clearSession() {
  sessionVersion += 1
  sessionWrite = sessionWrite.catch(() => undefined).then(async () => {
    await Promise.all([ACCESS_KEY, REFRESH_KEY, 'sahim.user'].map((key) => SecureStore.deleteItemAsync(key)))
  })
  await sessionWrite
}

export async function signIn(email: string, password: string): Promise<Session> {
  const result = await rawRequest<{ signIn: Session }>(
    'mutation SahimSignIn($email:String!,$password:String!){signIn(email:$email,password:$password){accessToken refreshToken user{id role}}}',
    { email, password },
  )
  if (result.signIn.user.role !== 'CONTRIBUTOR') throw new ApiError('This account cannot use Sahim')
  await saveSession(result.signIn)
  return result.signIn
}

async function performRefresh(session: Session): Promise<Session> {
  const version = sessionVersion
  const result = await rawRequest<{ refreshToken: Session }>(
    'mutation SahimRefreshToken($token:String!){refreshToken(data:$token){accessToken refreshToken user{id role}}}',
    { token: session.refreshToken },
  )
  if (version !== sessionVersion) throw new ApiError('Session changed')
  if (result.refreshToken.user.role !== 'CONTRIBUTOR') throw new ApiError('Account access changed', false, 'auth')
  await saveSession(result.refreshToken, version)
  return result.refreshToken
}

function refreshed(session: Session): Promise<Session> {
  if (!refreshInFlight) {
    const pending = performRefresh(session)
    refreshInFlight = pending
    void pending.finally(() => { if (refreshInFlight === pending) refreshInFlight = null }).catch(() => undefined)
  }
  return refreshInFlight
}

async function refreshForRequest(session: Session): Promise<Session> {
  try {
    const next = await refreshed(session)
    Object.assign(session, next)
    return next
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'auth') sessionExpiredHandler?.()
    throw error
  }
}

export async function request<T>(session: Session, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  try { return await rawRequest<T>(query, variables, session.accessToken) }
  catch (error) {
    if (!(error instanceof ApiError) || error.kind !== 'auth') throw error
    const next = await refreshForRequest(session)
    try { return await rawRequest<T>(query, variables, next.accessToken) }
    catch (retryError) {
      if (retryError instanceof ApiError && retryError.kind === 'auth') sessionExpiredHandler?.()
      throw retryError
    }
  }
}

export async function uploadImage(session: Session, uri: string): Promise<string> {
  const fileName = `sahim-${Date.now()}.jpg`
  const form = () => {
    const data = new FormData()
    data.append('operations', JSON.stringify({ query: 'mutation SahimUploadPhoto($file:File!){uploadSahimPhoto(file:$file){url}}', operationName: 'SahimUploadPhoto', variables: { file: null } }))
    data.append('map', JSON.stringify({ '0': ['variables.file'] }))
    data.append('0', { uri, name: fileName, type: 'image/jpeg' } as any)
    return data
  }
  async function send(token: string) {
    // React Native request bodies are single-use; build a fresh multipart payload
    // for an access-token retry so evidence is never silently dropped.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)
    try { return await fetch(API_URL, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form(), signal: controller.signal }) }
    catch { throw new ApiError('No connection. Photo is safe on this device.', true) }
    finally { clearTimeout(timeout) }
  }
  try {
    return (await readGraphQLResponse<{ uploadSahimPhoto: { url: string } }>(await send(session.accessToken))).uploadSahimPhoto.url
  } catch (error) {
    if (!(error instanceof ApiError) || error.kind !== 'auth') throw error
    const next = await refreshForRequest(session)
    try { return (await readGraphQLResponse<{ uploadSahimPhoto: { url: string } }>(await send(next.accessToken))).uploadSahimPhoto.url }
    catch (retryError) {
      if (retryError instanceof ApiError && retryError.kind === 'auth') sessionExpiredHandler?.()
      throw retryError
    }
  }
}

export const API_URL_CONFIGURED = Boolean(API_URL)
