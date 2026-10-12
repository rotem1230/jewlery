import { useEffect, type ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Provider, useDispatch, useSelector } from 'react-redux'
import { colors } from '@/src/theme/tokens'
import { bootstrapAuth, store, type AppDispatch, type RootState } from './store'

function AuthBootstrap({ children }: { children: ReactNode }) {
  const dispatch = useDispatch<AppDispatch>()
  const bootstrapped = useSelector((s: RootState) => s.auth.bootstrapped)

  useEffect(() => {
    void dispatch(bootstrapAuth())
  }, [dispatch])

  if (!bootstrapped) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.authBg,
        }}
      >
        <ActivityIndicator color={colors.brand} />
      </View>
    )
  }

  return children
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <AuthBootstrap>{children}</AuthBootstrap>
    </Provider>
  )
}
