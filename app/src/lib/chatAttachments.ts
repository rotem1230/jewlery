/** Gallery / camera picking normalized for chat uploads (DRY). */
import { Platform } from 'react-native'
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type ImagePickerResponse,
} from 'react-native-image-picker'
import type { LocalFile } from '@/src/api/uploads'

const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8 as const,
  selectionLimit: 1,
}

function toLocalFile(asset: Asset): LocalFile | null {
  if (!asset.uri) return null
  const mimeType = asset.type ?? 'image/jpeg'
  const fallbackName = `photo.${mimeType === 'image/png' ? 'png' : 'jpg'}`
  return {
    uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
    mimeType,
    fileName: asset.fileName ?? fallbackName,
  }
}

function firstAsset(response: ImagePickerResponse): LocalFile | null {
  if (response.didCancel) return null
  if (response.errorCode) {
    throw new Error(response.errorMessage ?? response.errorCode)
  }
  const asset = response.assets?.[0]
  return asset ? toLocalFile(asset) : null
}

/** System gallery sheet; null when cancelled, throws on real errors. */
export async function pickChatPhoto(): Promise<LocalFile | null> {
  return firstAsset(await launchImageLibrary(PICKER_OPTIONS))
}

/** System camera; null when cancelled, throws on real errors. */
export async function takeChatPhoto(): Promise<LocalFile | null> {
  return firstAsset(await launchCamera({ ...PICKER_OPTIONS, saveToPhotos: true }))
}

export function voiceFileName(): { fileName: string; mimeType: string } {
  return Platform.OS === 'ios'
    ? { fileName: 'voice-note.m4a', mimeType: 'audio/m4a' }
    : { fileName: 'voice-note.mp4', mimeType: 'audio/mp4' }
}
