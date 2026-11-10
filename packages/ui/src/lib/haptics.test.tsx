import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AccessibilityInfo, Platform } from 'react-native'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Button } from '../components/Button'
import { Option } from '../components/Option'
import { TabBar } from '../components/TabBar'
import { renderUi } from '../test-utils'
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
  isHapticsEnabled,
  setHapticsEnabled,
} from './haptics'

const mockModuleLoaded = vi.fn()
const mockSelectionAsync = vi.fn<() => Promise<void>>()
const mockImpactAsync = vi.fn<(style?: string) => Promise<void>>()
const mockNotificationAsync = vi.fn<(type?: string) => Promise<void>>()

vi.mock('expo-haptics', () => {
  mockModuleLoaded()
  return {
    ImpactFeedbackStyle: {
      Light: 'light',
      Medium: 'medium',
      Heavy: 'heavy',
    },
    NotificationFeedbackType: {
      Success: 'success',
      Warning: 'warning',
      Error: 'error',
    },
    selectionAsync: mockSelectionAsync,
    impactAsync: mockImpactAsync,
    notificationAsync: mockNotificationAsync,
  }
})

describe('haptics', () => {
  const originalOs = Platform.OS

  beforeEach(() => {
    setHapticsEnabled(true)
    mockSelectionAsync.mockReset().mockResolvedValue(undefined)
    mockImpactAsync.mockReset().mockResolvedValue(undefined)
    mockNotificationAsync.mockReset().mockResolvedValue(undefined)
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
  })

  afterEach(() => {
    ;(Platform as { OS: typeof Platform.OS }).OS = originalOs
    setHapticsEnabled(true)
    vi.restoreAllMocks()
  })

  it('is a strict no-op on web and never loads expo-haptics', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'web'

    await hapticSelection()
    await hapticLight()
    await hapticMedium()
    await hapticSuccess()
    await hapticWarning()

    expect(mockModuleLoaded).not.toHaveBeenCalled()
    expect(mockSelectionAsync).not.toHaveBeenCalled()
    expect(mockImpactAsync).not.toHaveBeenCalled()
    expect(mockNotificationAsync).not.toHaveBeenCalled()
  })

  it('invokes matching native expo-haptics APIs when enabled on iOS', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'

    await hapticSelection()
    await hapticLight()
    await hapticMedium()
    await hapticSuccess()
    await hapticWarning()

    expect(mockModuleLoaded).toHaveBeenCalledOnce()
    expect(mockSelectionAsync).toHaveBeenCalledOnce()
    expect(mockImpactAsync).toHaveBeenNthCalledWith(1, 'light')
    expect(mockImpactAsync).toHaveBeenNthCalledWith(2, 'medium')
    expect(mockNotificationAsync).toHaveBeenNthCalledWith(1, 'success')
    expect(mockNotificationAsync).toHaveBeenNthCalledWith(2, 'warning')
  })

  it('does not invoke haptics when reduce motion is enabled', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)

    await hapticMedium()
    await hapticSuccess()

    expect(mockImpactAsync).not.toHaveBeenCalled()
    expect(mockNotificationAsync).not.toHaveBeenCalled()
  })

  it('does not invoke haptics when disabled via preference', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'
    setHapticsEnabled(false)
    expect(isHapticsEnabled()).toBe(false)

    await hapticLight()
    await hapticSelection()
    await hapticWarning()

    expect(mockImpactAsync).not.toHaveBeenCalled()
    expect(mockSelectionAsync).not.toHaveBeenCalled()
    expect(mockNotificationAsync).not.toHaveBeenCalled()
  })

  it('swallows native errors silently without rejecting', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'
    mockImpactAsync.mockRejectedValueOnce(new Error('native unavailable'))
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValueOnce(new Error('a11y failure'))

    await expect(hapticMedium()).resolves.toBeUndefined()
    await expect(hapticWarning()).resolves.toBeUndefined()
  })

  it('triggers hapticMedium for primary Button only, hapticLight for Option, and hapticSelection on TabBar change', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'
    const onPrimary = vi.fn()
    const onGhost = vi.fn()
    const onOption = vi.fn()
    const onTabChange = vi.fn()

    renderUi(
      <>
        <Button variant="primaer" onPress={onPrimary}>
          Weiter
        </Button>
        <Button variant="ghost" onPress={onGhost}>
          Später
        </Button>
        <Option onPress={onOption}>Auswahl A</Option>
        <TabBar
          tabs={[
            { id: 'cockpit', label: 'Cockpit' },
            { id: 'profil', label: 'Profil' },
          ]}
          active="cockpit"
          onChange={onTabChange}
        />
      </>,
    )

    fireEvent.click(screen.getByText('Später'))
    expect(onGhost).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(mockImpactAsync).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Weiter'))
    expect(onPrimary).toHaveBeenCalledOnce()
    await waitFor(() => expect(mockImpactAsync).toHaveBeenCalledWith('medium'))

    fireEvent.click(screen.getByText('Auswahl A'))
    expect(onOption).toHaveBeenCalledOnce()
    await waitFor(() => expect(mockImpactAsync).toHaveBeenCalledWith('light'))

    fireEvent.click(screen.getByText('Cockpit'))
    expect(mockSelectionAsync).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Profil'))
    expect(onTabChange).toHaveBeenCalledWith('profil')
    await waitFor(() => expect(mockSelectionAsync).toHaveBeenCalledOnce())
  })
})
