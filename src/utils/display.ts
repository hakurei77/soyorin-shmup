/**
 * STG 界面通用显示工具
 */

/** KeyboardEvent.code → 友好显示名 */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Arrow')) {
    return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[
      code
    ]!
  }
  const map: Record<string, string> = {
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    Space: '空格',
    Escape: 'Esc',
    Tab: 'Tab',
    CapsLock: 'Caps',
    Mouse0: 'Mouse 1',
    Mouse1: 'Mouse 3',
    Mouse2: 'Mouse 2',
    Mouse3: 'Mouse 4',
    Mouse4: 'Mouse 5'
  }
  return map[code] ?? code
}
