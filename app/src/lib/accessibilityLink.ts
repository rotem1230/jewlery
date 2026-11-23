/**
 * Opens the accessibility page from any header without the header knowing the navigation tree:
 * the app root registers how (it holds the navigation container's ref).
 */
let opener: (() => void) | null = null

export function setAccessibilityOpener(open: (() => void) | null): void {
  opener = open
}

export function openAccessibility(): void {
  opener?.()
}
