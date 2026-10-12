import {
  configureStore,
  createAsyncThunk,
  createSlice,
  type Middleware,
  type PayloadAction,
} from '@reduxjs/toolkit'
import type { UserRole } from '@/src/constants/roles'
import { setAuthSessionBridge } from '@/src/lib/api'
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
  type PersistedAuthSession,
} from './authStorage'

export type AuthUser = {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  roles: UserRole[]
  activeRole: UserRole
}

type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  bootstrapped: boolean
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  bootstrapped: false,
}

/** Restore session from AsyncStorage on app launch. */
export const bootstrapAuth = createAsyncThunk('auth/bootstrap', async () => {
  return loadAuthSession()
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(
      state,
      action: PayloadAction<{
        user: AuthUser
        accessToken: string
        refreshToken: string
        persist?: boolean
      }>,
    ) {
      state.user = action.payload.user
      state.accessToken = action.payload.accessToken
      state.refreshToken = action.payload.refreshToken
    },
    setActiveRole(state, action: PayloadAction<UserRole>) {
      if (state.user) {
        state.user.activeRole = action.payload
      }
    },
    clearSession(state) {
      state.user = null
      state.accessToken = null
      state.refreshToken = null
    },
    /** Dev/demo: enter app without API */
    enterDemo(state, action: PayloadAction<UserRole>) {
      state.user = {
        id: 'demo',
        email: 'demo@mailnvosky.local',
        firstName: 'Demo',
        lastName: 'User',
        roles: [action.payload],
        activeRole: action.payload,
      }
      state.accessToken = 'demo'
      state.refreshToken = 'demo'
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        const session = action.payload
        if (session) {
          state.user = session.user
          state.accessToken = session.accessToken
          state.refreshToken = session.refreshToken
        }
        state.bootstrapped = true
      })
      .addCase(bootstrapAuth.rejected, (state) => {
        state.bootstrapped = true
      })
  },
})

export const { setSession, setActiveRole, clearSession, enterDemo } = authSlice.actions

const authPersistMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)

  if (setSession.match(action) && action.payload.persist === false) {
    void clearAuthSession()
  } else if (enterDemo.match(action) || setSession.match(action) || setActiveRole.match(action)) {
    const { user, accessToken, refreshToken } = (api.getState() as RootState).auth
    if (user && accessToken && refreshToken) {
      const session: PersistedAuthSession = { user, accessToken, refreshToken }
      void saveAuthSession(session)
    }
  }

  if (clearSession.match(action)) {
    void clearAuthSession()
  }

  return result
}

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(authPersistMiddleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

setAuthSessionBridge({
  getAccessToken: () => store.getState().auth.accessToken,
  getRefreshToken: () => store.getState().auth.refreshToken,
  applyTokens: ({ accessToken, refreshToken }) => {
    const user = store.getState().auth.user
    if (!user) return
    store.dispatch(setSession({ user, accessToken, refreshToken }))
  },
  onAuthLost: () => {
    store.dispatch(clearSession())
  },
})
