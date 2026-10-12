import './global.css'
import { StatusBar, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StoreProvider } from '@/src/store/Provider'
import { RootNavigator } from '@/src/navigation/RootNavigator'
import { navigationRef } from '@/src/navigation/navigationRef'
import { colors } from '@/src/theme/tokens'

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
          <NavigationContainer ref={navigationRef}>
            <View style={{ flex: 1 }}>
              <RootNavigator />
            </View>
          </NavigationContainer>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
