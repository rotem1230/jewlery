import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { ChatQuoteCard } from '@/src/components/chats/ChatQuoteCard'
import { ChatBubble } from '@/src/components/chats/ChatBubble'
import { ChatImageBubble } from '@/src/components/chats/ChatImageBubble'
import { ChatImageViewer } from '@/src/components/chats/ChatImageViewer'
import { ChatAudioBubble } from '@/src/components/chats/ChatAudioBubble'
import { ChatComposer } from '@/src/components/chats/ChatComposer'
import { VoiceRecorderBar } from '@/src/components/chats/VoiceRecorderBar'
import { FilterOptionsSheet } from '@/src/components/chats/FilterOptionsSheet'
import { QuoteApprovedBanner } from '@/src/components/chats/QuoteApprovedBanner'
import { Skeleton } from '@/src/components/ui/Skeleton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { useConversationThread, type ThreadBubble } from '@/src/hooks/useConversationThread'
import { pickChatPhoto, takeChatPhoto, voiceFileName } from '@/src/lib/chatAttachments'
import {
  cancelVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
} from '@/src/lib/voiceNotes'
import type { LocalFile } from '@/src/api/uploads'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { ChatsStackParamList } from '@/src/navigation/types'

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatThread'>
type Route = RouteProp<ChatsStackParamList, 'ChatThread'>

function ThreadSkeleton() {
  return (
    <View style={styles.messages} testID="thread-skeleton">
      <View style={styles.skelLeft}>
        <Skeleton width="68%" height={64} borderRadius={18} />
      </View>
      <View style={styles.skelRight}>
        <Skeleton width="52%" height={52} borderRadius={18} />
      </View>
      <View style={styles.skelLeft}>
        <Skeleton width="60%" height={72} borderRadius={18} />
      </View>
    </View>
  )
}

function ThreadMessage({
  item,
  playing,
  positionMs,
  durationMs,
  onTogglePlay,
  onImagePress,
}: {
  item: ThreadBubble
  playing: boolean
  positionMs: number
  durationMs: number
  onTogglePlay: (uri: string) => void
  onImagePress: (uri: string) => void
}) {
  if (item.kind === 'image' && item.mediaUri) {
    const uri = item.mediaUri
    return (
      <ChatImageBubble
        imageUri={uri}
        time={item.time}
        side={item.side}
        avatar={item.avatar}
        avatarLabel={item.avatarLabel}
        onPress={() => onImagePress(uri)}
      />
    )
  }
  if (item.kind === 'audio' && item.mediaUri) {
    const uri = item.mediaUri
    return (
      <ChatAudioBubble
        time={item.time}
        side={item.side}
        playing={playing}
        positionMs={positionMs}
        durationMs={durationMs}
        onTogglePlay={() => onTogglePlay(uri)}
        avatar={item.avatar}
        avatarLabel={item.avatarLabel}
      />
    )
  }
  if (item.kind === 'system') {
    return <Text style={styles.systemText}>{item.text}</Text>
  }
  return (
    <ChatBubble
      side={item.side}
      text={item.text}
      time={item.time}
      avatar={item.avatar}
      avatarLabel={item.avatarLabel}
    />
  )
}

/**
 * Figma צאט צורף ולקוח — messages from `GET /conversations/:id/messages`
 * grouped by day, realtime `message:new` over `/ws`, text/photo/voice send.
 * (Quote cards render above the thread; QUOTE_CARD rows are omitted.)
 */
export function ChatThreadScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const [draft, setDraft] = useState('')
  const [attachOpen, setAttachOpen] = useState(false)
  const [viewerUri, setViewerUri] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordElapsedMs, setRecordElapsedMs] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const quoteApproved = Boolean(route.params.quoteApproved)

  const {
    groups,
    loading,
    loadingEarlier,
    sending,
    uploading,
    error,
    hasMore,
    retry,
    loadEarlier,
    send,
    sendImageFile,
    sendAudioFile,
    playingUri,
    playbackPositionMs,
    playbackDurationMs,
    togglePlayback,
    latestQuote,
  } = useConversationThread(route.params.chatId)

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    }
  }, [])

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }

  const failAlert = () => {
    Alert.alert(t('chatSendFailedTitle'), t('chatSendFailedMessage'))
  }

  const attachFailAlert = () => {
    Alert.alert(t('chatAttachFailedTitle'), t('chatAttachFailedMessage'))
  }

  const onSend = () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    void send(text).then(scrollToEnd)
  }

  const onSendPhotoFile = (file: LocalFile) => {
    sendImageFile(file).then(scrollToEnd).catch(failAlert)
  }

  // iOS drops a native picker presented while the RN sheet modal is still
  // dismissing — close first, then wait out the dismissal animation.
  const ATTACH_DISMISS_MS = 450
  const afterSheetDismiss = () =>
    new Promise<void>((resolve) => setTimeout(resolve, ATTACH_DISMISS_MS))

  const onGallery = async () => {
    setAttachOpen(false)
    await afterSheetDismiss()
    try {
      const file = await pickChatPhoto()
      if (file) onSendPhotoFile(file)
    } catch {
      attachFailAlert()
    }
  }

  const onCamera = async () => {
    setAttachOpen(false)
    await afterSheetDismiss()
    try {
      const file = await takeChatPhoto()
      if (file) onSendPhotoFile(file)
    } catch {
      attachFailAlert()
    }
  }

  const stopRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
  }

  const onMicPress = async () => {
    if (recording) return
    try {
      await startVoiceRecording()
    } catch {
      failAlert()
      return
    }
    setRecording(true)
    setRecordElapsedMs(0)
    const startedAt = Date.now()
    recordTimerRef.current = setInterval(() => {
      setRecordElapsedMs(Date.now() - startedAt)
    }, 250)
  }

  const onCancelRecording = async () => {
    stopRecordTimer()
    setRecording(false)
    await cancelVoiceRecording()
  }

  const onSendRecording = async () => {
    stopRecordTimer()
    setRecording(false)
    try {
      const { uri } = await stopVoiceRecording()
      if (recordElapsedMs < 800) return
      const { fileName, mimeType } = voiceFileName()
      await sendAudioFile({ uri, mimeType, fileName })
      scrollToEnd()
    } catch {
      failAlert()
    }
  }

  const busy = sending || uploading

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScreenTopBar title={route.params.title || t('chatThreadTitle')} onBack={() => navigation.goBack()} />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <View style={styles.inset}>
          {latestQuote?.id ? (
            <ChatQuoteCard
              title={t('chatQuoteTitle')}
              spec={latestQuote.design?.title ?? ''}
              totalLabel={t('chatQuoteTotalLabel')}
              totalValue={
                latestQuote.totalPrice != null
                  ? `₪ ${Math.round(Number(latestQuote.totalPrice)).toLocaleString('he-IL')}`
                  : t('chatQuoteTotalValue')
              }
              materials={
                latestQuote.materialsCost != null
                  ? `${t('chatQuoteMaterials').split(':')[0]}: ₪ ${Math.round(Number(latestQuote.materialsCost)).toLocaleString('he-IL')}`
                  : t('chatQuoteMaterials')
              }
              labor={
                latestQuote.laborCost != null
                  ? `${t('chatQuoteLabor').split(':')[0]}: ₪ ${Math.round(Number(latestQuote.laborCost)).toLocaleString('he-IL')}`
                  : t('chatQuoteLabor')
              }
              delivery={t('chatQuoteDelivery').replace(
                '14',
                String(latestQuote.etaBusinessDays ?? 14),
              )}
              ctaLabel={t('chatQuoteCta')}
              onPressCta={() =>
                navigation.navigate('QuoteDetails', {
                  quoteId: latestQuote.id,
                  chatId: route.params.chatId,
                })
              }
            />
          ) : null}
        </View>

        {loading ? (
          <ThreadSkeleton />
        ) : error && groups.length === 0 ? (
          <View style={styles.inset}>
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          </View>
        ) : (
          <>
            {hasMore ? (
              <Pressable
                onPress={loadEarlier}
                disabled={loadingEarlier}
                style={styles.loadEarlier}
                accessibilityRole="button"
              >
                {loadingEarlier ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Text style={styles.loadEarlierLabel}>{t('chatLoadEarlier')}</Text>
                )}
              </Pressable>
            ) : null}
            {groups.map((group) => (
              <View key={group.dayKey}>
                <Text style={styles.dateStamp}>{group.dayLabel}</Text>
                <View style={styles.messages}>
                  {group.items.map((item) => (
                    <ThreadMessage
                      key={item.id}
                      item={item}
                      playing={!!item.mediaUri && playingUri === item.mediaUri}
                      positionMs={playingUri === item.mediaUri ? playbackPositionMs : 0}
                      durationMs={playingUri === item.mediaUri ? playbackDurationMs : 0}
                      onTogglePlay={togglePlayback}
                      onImagePress={setViewerUri}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {quoteApproved ? (
          <View style={styles.inset}>
            <QuoteApprovedBanner
              title={t('chatQuoteApprovedTitle')}
              body={t('chatQuoteApprovedBody')}
              linkLabel={t('chatQuoteApprovedLink')}
              onPressLink={() => {
                if (!latestQuote?.id) return
                navigation.navigate('QuoteDetails', {
                  quoteId: latestQuote.id,
                  chatId: route.params.chatId,
                })
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      {recording ? (
        <VoiceRecorderBar
          elapsedMs={recordElapsedMs}
          sending={uploading}
          onCancel={onCancelRecording}
          onSend={onSendRecording}
        />
      ) : (
        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          placeholder={t('chatInputPlaceholder')}
          onSend={busy ? undefined : onSend}
          onAttach={() => setAttachOpen(true)}
          onMicPress={onMicPress}
          onGalleryPress={onGallery}
        />
      )}

      <FilterOptionsSheet
        visible={attachOpen}
        options={[
          { id: 'gallery', label: t('chatAttachGallery') },
          { id: 'camera', label: t('chatAttachCamera') },
        ]}
        onSelect={(option) => {
          if (option.id === 'gallery') void onGallery()
          else void onCamera()
        }}
        onRequestClose={() => setAttachOpen(false)}
      />

      <ChatImageViewer imageUri={viewerUri} onClose={() => setViewerUri(null)} />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.homeBg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
  },
  inset: {
    width: '100%',
    paddingHorizontal: 16,
  },
  dateStamp: {
    width: '100%',
    paddingHorizontal: 16,
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  systemText: {
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 8,
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  messages: {
    width: '100%',
    gap: 16,
  },
  loadEarlier: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadEarlierLabel: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '500',
    color: colors.brand,
    textAlign: 'center',
  },
  skelLeft: {
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 16,
  },
  skelRight: {
    alignItems: 'flex-end',
    width: '100%',
    paddingHorizontal: 16,
  },
})
