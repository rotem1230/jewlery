import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SplashScreen } from '@/src/screens/auth/SplashScreen'
import { RoleSelectScreen } from '@/src/screens/auth/RoleSelectScreen'
import { LoginScreen } from '@/src/screens/auth/LoginScreen'
import { SignupScreen } from '@/src/screens/auth/SignupScreen'
import { ForgotPasswordScreen } from '@/src/screens/auth/ForgotPasswordScreen'
import { TermsScreen } from '@/src/screens/shared/TermsScreen'
import type { AuthStackParamList } from './types'

const Stack = createNativeStackNavigator<AuthStackParamList>()

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
    </Stack.Navigator>
  )
}
