/**
 * 输入抽象层
 * 操作方式：WASD 移动（键位可自定义并持久化到 localStorage），
 * 射击 / 瞄准默认鼠标左右键（均可改绑），自机始终朝鼠标方向（由游戏层解释 mouse 坐标）
 * attach/detach 成对调用，组件卸载时必须 detach
 */
import { BALANCE } from '../config/balance'
import { field } from './field'
import type { KeyAction, KeyBindings, Vec2 } from '../types'

/** 默认键位（来自策划配置） */
const DEFAULT_KEYS: KeyBindings = { ...BALANCE.defaultKeys }

/** 鼠标键：MouseEvent.button → 内部 code（射击 / 瞄准默认绑定左右键，均可改绑） */
const MOUSE_CODES: Record<number, string> = {
  0: 'Mouse0',
  1: 'Mouse1',
  2: 'Mouse2',
  3: 'Mouse3',
  4: 'Mouse4',
}

export class InputManager {
  /** 当前按下的按键 code 集合 */
  private keys = new Set<string>()
  /** 鼠标在逻辑坐标系中的位置（射击 / 瞄准状态由 keys 集合 + bindings 判定） */
  mouse: { x: number; y: number } = {
    x: BALANCE.player.spawnX,
    y: 0,
  }
  /** 当前生效的键位映射 */
  private bindings: KeyBindings = { ...DEFAULT_KEYS }
  /** 武器槽切换请求（1/2 键按下沿），由游戏层消费 */
  private weaponSlotQueued: 0 | 1 | null = null
  /** 手动换弹请求（R 键按下沿），由游戏层消费 */
  private reloadQueued = false
  /** 滚轮增量累积（正=向下），由游戏层消费 */
  private wheelAcc = 0

  /** 低速 / 判定点触发方式（由游戏层通过 setSlowMode 注入，引擎不读 UI 存储） */
  private slowMode: 'hold' | 'toggle' = 'hold'
  /** 切换模式下低速是否处于开启状态 */
  private slowToggled = false
  /** 冲刺触发方式（由游戏层通过 setSprintMode 注入） */
  private sprintMode: 'hold' | 'toggle' = 'hold'
  /** 切换模式下冲刺是否处于开启状态 */
  private sprintToggled = false

  /** 边沿触发的暂停 / 闪现 / 技能请求（由游戏主循环消费） */
  private pauseQueued = false
  private dashQueued = false
  private skillQueued = false

  /** 事件源（canvas 元素），用于鼠标坐标换算 */
  private el: HTMLElement | null = null

  constructor() {
    this.loadBindings()
  }

  attach(el: HTMLElement) {
    this.el = el
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    el.addEventListener('mousemove', this.onMouseMove)
    el.addEventListener('mousedown', this.onMouseDown)
    el.addEventListener('contextmenu', this.onContextMenu)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('mouseup', this.onMouseUp)
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    if (this.el) {
      this.el.removeEventListener('mousemove', this.onMouseMove)
      this.el.removeEventListener('mousedown', this.onMouseDown)
      this.el.removeEventListener('contextmenu', this.onContextMenu)
      this.el.removeEventListener('wheel', this.onWheel)
    }
    window.removeEventListener('mouseup', this.onMouseUp)
    this.el = null
    this.keys.clear()
    this.weaponSlotQueued = null
    this.wheelAcc = 0
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.gameKeys().has(e.code)) e.preventDefault()
    if (e.repeat) return
    // 武器槽直达：1/2（固定键位，不参与改绑）；R 手动换弹
    if (e.code === 'Digit1') this.weaponSlotQueued = 0
    else if (e.code === 'Digit2') this.weaponSlotQueued = 1
    else if (e.code === 'KeyR') this.reloadQueued = true
    this.press(e.code)
  }

  /**
   * 按键按下（键盘与鼠标键共用入口）：
   * 维护按住集合、切换模式翻转与边沿触发请求
   */
  private press(code: string) {
    this.keys.add(code)
    // 切换模式：每按一次低速键翻转一次开关（键盘 repeat 已在 onKeyDown 拦截）
    if (this.slowMode === 'toggle' && code === this.bindings.slow) {
      this.slowToggled = !this.slowToggled
    }
    if (this.sprintMode === 'toggle' && code === this.bindings.sprint) {
      this.sprintToggled = !this.sprintToggled
    }
    if (code === this.bindings.dash) this.dashQueued = true
    if (code === this.bindings.skill) this.skillQueued = true
    // Esc / P 始终可暂停，但已被改绑到其他动作时让位（避免一键双触发）
    const bound = Object.values(this.bindings)
    if (
      code === this.bindings.pause ||
      (code === 'Escape' && !bound.includes('Escape')) ||
      (code === 'KeyP' && !bound.includes('KeyP'))
    ) {
      this.pauseQueued = true
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onBlur = () => {
    this.keys.clear()
    this.weaponSlotQueued = null
    this.reloadQueued = false
    this.wheelAcc = 0
    this.slowToggled = false
    this.sprintToggled = false
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.el) return
    const rect = this.el.getBoundingClientRect()
    // CSS 像素 → 逻辑坐标（逻辑坐标系 = 画布尺寸，铺满窗口）
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * field.width
    this.mouse.y = ((e.clientY - rect.top) / rect.height) * field.height
  }

  private onMouseDown = (e: MouseEvent) => {
    // 所有鼠标键统一走 press：左键默认射击、右键默认瞄准（均可改绑）；
    // 中键 / 侧键阻断浏览器默认行为（侧键 = 前进 / 后退导航）
    const code = MOUSE_CODES[e.button]
    if (code) {
      e.preventDefault()
      this.press(code)
    }
  }

  private onMouseUp = (e: MouseEvent) => {
    const code = MOUSE_CODES[e.button]
    if (code) this.keys.delete(code)
  }

  private onContextMenu = (e: Event) => {
    e.preventDefault()
  }

  /** 滚轮：阻断页面滚动，只累积方向供游戏层消费（切武器） */
  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.wheelAcc += e.deltaY
  }

  /** 需要 preventDefault 的按键集合（当前绑定 + 固定功能键） */
  private gameKeys(): Set<string> {
    return new Set([...Object.values(this.bindings), 'KeyP', 'Space'])
  }

  // ==================== 键位自定义（持久化到 localStorage） ====================

  /** 当前键位映射的副本（供设置界面展示） */
  getBindings(): KeyBindings {
    return { ...this.bindings }
  }

  /**
   * 重新绑定某个动作
   * 若新按键已被其他动作占用，则被占用的动作置为未设置（空串），
   * 由设置界面标红提示玩家重新指定，避免一键双触发
   */
  rebind(action: KeyAction, code: string) {
    const conflict = (Object.keys(this.bindings) as KeyAction[]).find(
      (a) => a !== action && this.bindings[a] === code
    )
    if (conflict) this.bindings[conflict] = ''
    this.bindings[action] = code
    this.saveBindings()
  }

  /** 恢复默认键位 */
  resetBindings() {
    this.bindings = { ...DEFAULT_KEYS }
    this.saveBindings()
  }

  /** 整体替换键位映射并持久化（设置面板「保存配置」时一次性提交草稿） */
  setBindings(next: KeyBindings) {
    this.bindings = { ...next }
    this.saveBindings()
  }

  private loadBindings() {
    try {
      const raw = localStorage.getItem(BALANCE.storageKeys.keybinds)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<KeyBindings>
      for (const action of Object.keys(DEFAULT_KEYS) as KeyAction[]) {
        if (typeof saved[action] === 'string') {
          this.bindings[action] = saved[action]
        }
      }
      // 旧版本存档可能与新默认键位冲突（如减速从 Shift 挪到 Ctrl），
      // 出现重复按键时整体回退到默认键位（空串为合法的「未设置」状态，不参与查重）
      const codes = Object.values(this.bindings).filter(Boolean)
      if (new Set(codes).size !== codes.length) {
        this.bindings = { ...DEFAULT_KEYS }
      }
    } catch {
      // 隐私模式 / 数据损坏时使用默认键位
    }
  }

  private saveBindings() {
    try {
      localStorage.setItem(
        BALANCE.storageKeys.keybinds,
        JSON.stringify(this.bindings)
      )
    } catch {
      // 静默失败
    }
  }

  // ==================== 游戏层查询接口 ====================

  /** 移动方向轴（已归一化到 -1~1，斜向不加速） */
  getAxis(): Vec2 {
    let x = 0
    let y = 0
    if (this.keys.has(this.bindings.left)) x -= 1
    if (this.keys.has(this.bindings.right)) x += 1
    if (this.keys.has(this.bindings.up)) y -= 1
    if (this.keys.has(this.bindings.down)) y += 1
    // 斜向移动归一化，避免斜走更快
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2)
      x *= inv
      y *= inv
    }
    return { x, y }
  }

  /** 低速 / 判定点是否生效（长按模式看按住状态，切换模式看开关状态） */
  get slow(): boolean {
    if (this.slowMode === 'toggle') return this.slowToggled
    return this.keys.has(this.bindings.slow)
  }

  /** 设置低速触发方式（切换模式切换时复位开关，避免残留状态） */
  setSlowMode(mode: 'hold' | 'toggle') {
    this.slowMode = mode
    this.slowToggled = false
  }

  /** 设置冲刺触发方式（切换模式切换时复位开关，避免残留状态） */
  setSprintMode(mode: 'hold' | 'toggle') {
    this.sprintMode = mode
    this.sprintToggled = false
  }

  /** 是否正在冲刺（长按模式看按住状态且 Shift 左右互通，切换模式看开关状态） */
  get sprint(): boolean {
    if (this.sprintMode === 'toggle') return this.sprintToggled
    const code = this.bindings.sprint
    if (this.keys.has(code)) return true
    if (code === 'ShiftLeft' && this.keys.has('ShiftRight')) return true
    if (code === 'ShiftRight' && this.keys.has('ShiftLeft')) return true
    return false
  }

  /** 是否正在射击（按住射击键） */
  get shooting(): boolean {
    return this.keys.has(this.bindings.fire)
  }

  /** 是否正在瞄准（按住瞄准键，动能武器 ADS） */
  get aiming(): boolean {
    return this.keys.has(this.bindings.aim)
  }

  /** 消费一次暂停请求（边沿触发） */
  consumePause(): boolean {
    const q = this.pauseQueued
    this.pauseQueued = false
    return q
  }

  /** 消费一次闪现请求（边沿触发） */
  consumeDash(): boolean {
    const q = this.dashQueued
    this.dashQueued = false
    return q
  }

  /** 消费一次技能请求（边沿触发） */
  consumeSkill(): boolean {
    const q = this.skillQueued
    this.skillQueued = false
    return q
  }

  /** 消费武器槽切换请求（1/2 键按下沿，无请求返回 null） */
  consumeWeaponSlot(): 0 | 1 | null {
    const s = this.weaponSlotQueued
    this.weaponSlotQueued = null
    return s
  }

  /** 消费滚轮方向（正=向下 / 负=向上，无滚动返回 0） */
  consumeWheelDir(): number {
    if (this.wheelAcc === 0) return 0
    const dir = Math.sign(this.wheelAcc)
    this.wheelAcc = 0
    return dir
  }

  /** 消费一次手动换弹请求（R 键按下沿） */
  consumeReload(): boolean {
    const q = this.reloadQueued
    this.reloadQueued = false
    return q
  }
}
