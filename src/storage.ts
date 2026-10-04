import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'

export type Draft = {
  localId: string
  kind: 'BARCODE' | 'PRODUCT'
  status: 'draft' | 'queued' | 'pending' | 'error' | 'approved' | 'rejected'
  input: Record<string, any>
  message?: string
  createdAt: number
}

const key = (userId: number) => `sahim.items.${userId}`
let lastWrite = Promise.resolve()

export async function readDrafts(userId: number): Promise<Draft[]> {
  try { return JSON.parse((await AsyncStorage.getItem(key(userId))) || '[]') }
  catch { return [] }
}

export async function writeDrafts(userId: number, drafts: Draft[]) {
  const snapshot = JSON.stringify(drafts)
  lastWrite = lastWrite.catch(() => undefined).then(() => AsyncStorage.setItem(key(userId), snapshot))
  await lastWrite
}

export async function persistPhoto(uri: string): Promise<string> {
  const directory = `${FileSystem.documentDirectory}sahim-photos/`
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  const destination = `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
  const jpeg = await ImageManipulator.manipulateAsync(uri, [], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG })
  await FileSystem.copyAsync({ from: jpeg.uri, to: destination })
  return destination
}

export const isLocalPhoto = (value: unknown): value is string => typeof value === 'string' && value.startsWith('file:')

export async function removeUnusedDraftPhotos(removed: Draft, remaining: Draft[]) {
  const photos = (draft: Draft) => [draft.input.image, ...(Array.isArray(draft.input.variants) ? draft.input.variants.map((variant: { image?: string }) => variant.image) : [])]
  const used = new Set(remaining.flatMap(photos))
  const ownDirectory = `${FileSystem.documentDirectory}sahim-photos/`
  await Promise.all(photos(removed)
    .filter((uri): uri is string => typeof uri === 'string' && uri.startsWith(ownDirectory) && !used.has(uri))
    .map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)))
}
