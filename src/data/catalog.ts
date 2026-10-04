import AsyncStorage from '@react-native-async-storage/async-storage'
import { ApiError, request, Session } from '../api'
import { CatalogItem, Template } from '../domain/catalog'

export function searchErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      SEARCH_TOO_LONG: 'Search is too long. Use up to 120 characters.',
      SEARCH_TOO_MANY_TERMS: 'Use up to 10 search words.',
      SEARCH_INVALID: 'Enter a product name or description.',
    }
    if (messages[error.message]) return messages[error.message]
    if (error.code === 'RATE_LIMITED' || /too many requests/i.test(error.message)) return 'Too many searches. Try again shortly.'
    if (error.offline) return 'No connection. Search saved catalog items or try again online.'
  }
  return 'Could not search products. Try again.'
}

export async function loadCatalog(session: Session): Promise<CatalogItem[]> {
  const key = `sahim.catalog.${session.user.id}`
  try {
    const data = await request<{ findManyNiches: { niches: CatalogItem[] } }>(session,
      'query SahimCatalog{findManyNiches(page:1,limit:100,isFull:true){niches{id name categories{categories{id name productTypes{productTypes{id name}}}} brands{brands{id name}}}}}',
    )
    void AsyncStorage.setItem(key, JSON.stringify(data.findManyNiches.niches)).catch(() => undefined)
    return data.findManyNiches.niches
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'auth') throw error
    const cached = await AsyncStorage.getItem(key).catch(() => null)
    if (cached) {
      try { return JSON.parse(cached) as CatalogItem[] }
      catch { /* Report the original network or server error. */ }
    }
    throw error
  }
}

export async function searchTemplates(session: Session, term: string): Promise<Template[]> {
  const key = `sahim.search.${session.user.id}`
  try {
    const data = await request<{ findManyProductTemplates: { productTemplates: Template[] } }>(session,
      'query SahimSearchTemplates($search:String!){findManyProductTemplates(search:$search,page:1,limit:20){productTemplates{id name description variants{id name barcode}}}}',
      { search: term },
    )
    void AsyncStorage.getItem(key).then((cached) => {
      const previous: Template[] = cached ? JSON.parse(cached) : []
      const merged = new Map(previous.map((item) => [item.id, item]))
      for (const item of data.findManyProductTemplates.productTemplates) merged.set(item.id, item)
      return AsyncStorage.setItem(key, JSON.stringify([...merged.values()].slice(-500)))
    }).catch(() => undefined)
    return data.findManyProductTemplates.productTemplates
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'auth') throw error
    if (error instanceof ApiError && (!error.retryable || error.code === 'RATE_LIMITED')) throw error
    const cached = await AsyncStorage.getItem(key).catch(() => null)
    if (cached) {
      try {
        const terms = [...new Set(term.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
        return (JSON.parse(cached) as Template[]).filter((item) =>
          terms.every((word) => [item.name, item.description || '', ...item.variants.map((variant) => variant.name || '')]
            .some((field) => field.toLocaleLowerCase().includes(word))),
        ).slice(0, 20)
      }
      catch { /* Fall through to the network error. */ }
    }
    throw error
  }
}

export async function lookupBarcode(session: Session, code: string) {
  const data = await request<{ sahimBarcodeLookup: { id: number; name: string | null; product: { name: string } } | null }>(session,
    'query SahimBarcodeLookup($code:String!){sahimBarcodeLookup(barcode:$code){id name product{name}}}', { code },
  )
  return data.sahimBarcodeLookup
}
