import './global.css'
import { useEffect } from 'react'
import { StatusBar, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StoreProvider } from '@/src/store/Provider'
import { RootNavigator } from '@/src/navigation/RootNavigator'
import { navigationRef } from '@/src/navigation/navigationRef'
import { warmUpBackend } from '@/src/lib/api'
import { colors } from '@/src/theme/tokens'

export default function App() {
  // The hosted API sleeps when idle: start waking it while the session is being restored.
  useEffect(() => {
    void warmUpBackend()
  }, [])

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
