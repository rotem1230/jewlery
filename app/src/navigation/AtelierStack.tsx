import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AtelierScreen } from '@/src/screens/shared/AtelierScreen'
import { JewelerProfileScreen } from '@/src/screens/shared/JewelerProfileScreen'
import { AddRecommendationScreen } from '@/src/screens/shared/AddRecommendationScreen'
import { SubmitQuoteScreen } from '@/src/screens/shared/SubmitQuoteScreen'
import { PublicDesignScreen } from '@/src/screens/shared/PublicDesignScreen'
import type { AtelierStackParamList } from './types'

const Stack = createNativeStackNavigator<AtelierStackParamList>()

export function AtelierStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AtelierList" component={AtelierScreen} />
      <Stack.Screen name="JewelerProfile" component={JewelerProfileScreen} />
      <Stack.Screen name="AddRecommendation" component={AddRecommendationScreen} />
      <Stack.Screen name="SubmitQuote" component={SubmitQuoteScreen} />
      <Stack.Screen name="DesignPreview" component={PublicDesignScreen} />
    </Stack.Navigator>
  )
}
