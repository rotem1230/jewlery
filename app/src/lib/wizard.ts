import { Alert } from 'react-native'
import { createDesign } from '@/src/api/designs'
import { itemTypeIdForCategory } from '@/src/api/masterData'
import { parseApiError } from '@/src/lib/api'
import type { JewelryCategory } from '@/src/navigation/types'

export async function createWizardDesign(
  category: JewelryCategory,
  title: string,
  parameters: Record<string, unknown>,
): Promise<string> {
  const itemTypeId = await itemTypeIdForCategory(category)
  if (!itemTypeId) {
    throw new Error('Unknown item type')
  }
  const design = await createDesign({
    itemTypeId,
    title,
    parameters: {
      metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
      ...parameters,
    },
  })
  return design.id
}

export function wizardFailAlert(title: string, err: unknown) {
  Alert.alert(title, parseApiError(err))
}
