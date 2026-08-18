/**
 * 出击指南 Canvas 预览 composable
 * 职责：角色/敌人/轨迹/武器/技能/行为 六大页签的逐帧动画演示
 * 所有运动公式与 engine/enemy.ts、bullet.ts、player.ts、renderer.ts 的实现保持一致
 */
import { nextTick, watch, type Ref } from 'vue'
import type {
  BehaviorType,
  EnemyKey,
  EnemyWeaponKey,
  SkillKey,
  WeaponKey
} from '../../../types'
import { SpriteManager, type SpriteAnim } from '../../../assets/sprites'
import { CHARACTERS } from '../../../config/loadout'
import { ENEMIES } from '../../../config/enemies'
import { ENEMY_WEAPONS } from '../../../weapons/enemyWeapons'
import { PLAYER_WEAPONS } from '../../../weapons/playerWeapons'
import type { GuideEnemyPathKey, GuideTab } from './guideData'

export const GUIDE_W = 240
export const GUIDE_H = 320
const SHIP_Y = GUIDE_H - 30

interface PreviewEnemy {
  x: number
  y: number
  hp: number
  maxHp: number
  r: number
  /** 受击闪白剩余帧 */
  flash: number
  /** 重生倒计时（0 = 存活） */
  dead: number
}
interface PreviewShot {
  x: number
  y: number
  vx: number
  vy: number
}
interface SkillEnemy {
  x: number
  y: number
  vy: number
  fireT: number
}

export interface GuidePreviewSources {
  canvasRef: Ref<HTMLCanvasElement | null>
  tab: Ref<GuideTab>
  selectedCharacter: Ref<string>
  selectedEnemy: Ref<EnemyKey>
  selectedEnemyWeapon: Ref<EnemyWeaponKey>
  selectedEnemyPath: Ref<GuideEnemyPathKey>
  selectedEnemyBehavior: Ref<BehaviorType>
  selectedWeapon: Ref<WeaponKey>
  selectedSkill: Ref<SkillKey>
}

/** 残影色带插值：与 renderer.ts 的 SAND_STOPS 一致（淡黄→红→紫→蓝→青绿） */
const SKILL_TRAIL_STOPS: [number, number, number, number][] = [
  [0.0, 254, 240, 138],
  [0.25, 239, 68, 68],
  [0.5, 168, 85, 247],
  [0.75, 59, 130, 246],
  [1.0, 45, 212, 191]
]

function skillTrailColor(ratio: number): [number, number, number] {
  for (let i = 1; i < SKILL_TRAIL_STOPS.length; i++) {
    if (ratio <= SKILL_TRAIL_STOPS[i]![0]) {
      const prev = SKILL_TRAIL_STOPS[i - 1]!
      const next = SKILL_TRAIL_STOPS[i]!
      const k = (ratio - prev[0]) / (next[0] - prev[0])
      return [
        Math.round(prev[1] + (next[1] - prev[1]) * k),
        Math.round(prev[2] + (next[2] - prev[2]) * k),
        Math.round(prev[3] + (next[3] - prev[3]) * k)
      ]
    }
  }
  const last = SKILL_TRAIL_STOPS[SKILL_TRAIL_STOPS.length - 1]!
  return [last[1], last[2], last[3]]
}

export function useGuidePreview(sources: GuidePreviewSources) {
  const { canvasRef, tab, selectedCharacter, selectedEnemy, selectedEnemyWeapon, selectedEnemyPath, selectedEnemyBehavior, selectedWeapon } =
    sources

  let raf = 0
  let t = 0
  /** 角色演示的飞行尾迹采样点 */
  let cTrail: { x: number; y: number }[] = []

  let wEnemies: PreviewEnemy[] = []
  let wShots: PreviewShot[] = []
  /** 激光束视觉残留（激光武器演示用，与 game.ts fireLaser 一致） */
  let wBeams: { x1: number; y1: number; x2: number; y2: number; ttl: number; hit?: boolean }[] = []

  let sEnemies: SkillEnemy[] = []
  let pBullets: { x: number; y: number; vx: number; vy: number }[] = []
  let sBullets: { x: number; y: number; vx: number; vy: number }[] = []
  /** 自机弹（期间自机武器不受影响，保持原速） */
  let sShots: { x: number; y: number }[] = []
  let sFireCd = 0
  /** 彩虹残影采样点（与 player.ts 的 rainbowTrail 一致） */
  let sTrail: { x: number; y: number }[] = []
  /** 电磁脉冲演示：冲击波扩散进度（0 = 无）与敌机剩余干扰帧数 */
  let empWave = 0
  let empStun = 0
  /** 双子星卫演示：卫星轨道角（弧度）与挡弹火花 */
  let gemAngle = 0
  let gemSparks: { x: number; y: number; ttl: number }[] = []

  // ==================== 敌人单位演示 ====================

  let eBullets: PreviewShot[] = []
  let eFireT = 0

  function resetEnemyPreview() {
    eBullets = []
    eFireT = 0
  }

  /**
   * 敌人页签：敌人单位逐帧演示
   * 顶部敌机按 icon 形状（三角形 / 正方形）与 iconColor 绘制，
   * 搭载武器（config/enemies.ts → weapons/enemyWeapons.ts）持续开火，
   * 自机在底部游走躲避。发射行为与 drawEnemyWeaponPreview 一致。
   */
  function drawEnemyPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    const enemy = ENEMIES[selectedEnemy.value]
    const weapon = ENEMY_WEAPONS[enemy.weapon]
    const color = weapon.bulletColor

    // 敌机：顶部中央缓慢漂移（正弦摆动）
    const ex = GUIDE_W / 2 + Math.sin(t * 0.015) * 40
    const ey = 60
    // 自机：底部游走
    const px = GUIDE_W / 2 + Math.sin(t * 0.03) * 60
    const py = SHIP_Y

    // --- 发射（与 drawEnemyWeaponPreview 一致：按武器 fireInterval 发射扇形弹幕） ---
    eFireT++
    const speed = weapon.bulletSpeed * (GUIDE_W / 480)
    if (eFireT >= Math.max(1, weapon.fireInterval)) {
      eFireT = 0
      const aim = Math.atan2(py - ey, px - ex)
      const n = Math.max(1, weapon.bulletCount ?? 1)
      const DEG = Math.PI / 180
      const total = (weapon.spreadAngle ?? 8 * (n - 1)) * DEG
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? aim : aim - total / 2 + (total * i) / (n - 1)
        eBullets.push({ x: ex, y: ey, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed })
      }
    }

    // --- 子弹推进 ---
    for (const b of eBullets) {
      b.x += b.vx
      b.y += b.vy
    }
    eBullets = eBullets.filter(
      (b) => b.x > -10 && b.x < GUIDE_W + 10 && b.y > -10 && b.y < GUIDE_H + 10
    )

    // --- 绘制敌机本体（根据 icon 形状绘制，颜色取 iconColor，Boss 体型更大） ---
    const isBoss = enemy.category === 'boss'
    const size = isBoss ? 22 : 7
    ctx.fillStyle = enemy.iconColor
    ctx.shadowColor = enemy.iconColor
    ctx.shadowBlur = isBoss ? 24 : 10
    if (enemy.icon === 'triangle') {
      ctx.beginPath()
      ctx.moveTo(ex, ey + size)
      ctx.lineTo(ex - size, ey - size * 0.7)
      ctx.lineTo(ex + size, ey - size * 0.7)
      ctx.closePath()
      ctx.fill()
    } else if (enemy.icon === 'leviathan') {
      // 巨构舰体：横向展开的宽体剪影
      ctx.beginPath()
      ctx.moveTo(ex - size * 2.6, ey)
      ctx.lineTo(ex - size * 1.6, ey - size)
      ctx.lineTo(ex + size * 1.6, ey - size)
      ctx.lineTo(ex + size * 2.6, ey)
      ctx.lineTo(ex + size * 1.4, ey + size * 0.8)
      ctx.lineTo(ex - size * 1.4, ey + size * 0.8)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else if (enemy.icon === 'drone') {
      // 后掠翼拦截机
      ctx.beginPath()
      ctx.moveTo(ex + size * 1.2, ey)
      ctx.lineTo(ex, ey + size * 0.7)
      ctx.lineTo(ex - size * 0.9, ey + size * 0.9)
      ctx.lineTo(ex - size * 1.2, ey + size * 0.3)
      ctx.lineTo(ex - size * 1.2, ey - size * 0.3)
      ctx.lineTo(ex - size * 0.9, ey - size * 0.9)
      ctx.lineTo(ex, ey - size * 0.7)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#9fdcff'
      ctx.beginPath()
      ctx.arc(ex + size * 0.4, ey, size * 0.22, 0, Math.PI * 2)
      ctx.fill()
    } else if (enemy.icon === 'laser-drone') {
      // 悬浮菱形 + 聚能透镜
      ctx.beginPath()
      ctx.moveTo(ex + size, ey)
      ctx.lineTo(ex, ey + size * 0.8)
      ctx.lineTo(ex - size * 0.8, ey)
      ctx.lineTo(ex, ey - size * 0.8)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(ex, ey, size + 4, 0, Math.PI * 2)
      ctx.stroke()
    } else if (enemy.icon === 'circle') {
      // Boss 白色巨大圆形
      ctx.beginPath()
      ctx.arc(ex, ey, size, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(ex, ey, size + 4, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      // square
      ctx.fillRect(ex - size, ey - size, size * 2, size * 2)
    }
    ctx.shadowBlur = 0

    // --- 绘制敌弹 ---
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    for (const b of eBullets) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0

    // --- 绘制自机 ---
    ctx.fillStyle = '#7dd3fc'
    ctx.shadowColor = '#7dd3fc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(px, py - 12)
    ctx.lineTo(px - 8, py + 6)
    ctx.lineTo(px + 8, py + 6)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0

    // --- 状态文本 ---
    ctx.font = '10px ui-monospace, Consolas, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(`${enemy.key} // ${weapon.key}`, 8, 16)
  }

  // ==================== 武器演示 ====================

  function resetWeaponPreview() {
    wShots = []
    wBeams = []
    const mk = (x: number, y: number, hp: number): PreviewEnemy => ({
      x,
      y,
      hp,
      maxHp: hp,
      r: 8,
      flash: 0,
      dead: 0
    })
    wEnemies = [mk(50, 60, 90), mk(120, 45, 90), mk(190, 60, 90)]
  }

  /**
   * 武器页签：模拟自机开火 → 命中 → 击杀重生 的循环演示
   * 发射行为由 weapons/playerWeapons.ts 驱动：朝瞄准方向（轻微摆动）一次一颗弹丸
   */
  function drawWeaponPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    const weapon = PLAYER_WEAPONS[selectedWeapon.value]
    const shipX = GUIDE_W / 2

    // --- 发射（间隔取武器的 fireInterval，弹速按 480 设计宽等比缩放到预览区） ---
    const speed = weapon.bulletSpeed * (GUIDE_W / 480)
    if (weapon.laser) {
      // 激光武器：持续照射——每帧重建光束保持连续（与 game.ts fireLaser 一致），
      // 伤害按 fireInterval 节拍结算
      const aim = -Math.PI / 2 + Math.sin(t * 0.02) * 0.55
      const sx = shipX
      const sy = SHIP_Y - 10
      const dx = Math.cos(aim)
      const dy = Math.sin(aim)
      let bestT = Infinity
      let hit: PreviewEnemy | null = null
      for (const e of wEnemies) {
        if (e.dead > 0) continue
        const tc = (e.x - sx) * dx + (e.y - sy) * dy
        if (tc < 0) continue
        const nx = sx + dx * tc - e.x
        const ny = sy + dy * tc - e.y
        const rr = e.r + 3
        const d2 = nx * nx + ny * ny
        if (d2 > rr * rr) continue
        const t0 = Math.max(0, tc - Math.sqrt(rr * rr - d2))
        if (t0 < bestT) {
          bestT = t0
          hit = e
        }
      }
      const ex = hit ? hit.x : sx + dx * 800
      const ey = hit ? hit.y : sy + dy * 800
      wBeams.length = 0
      wBeams.push({ x1: sx, y1: sy, x2: ex, y2: ey, ttl: 6, hit: hit !== null })
      if (hit && t % Math.max(1, weapon.fireInterval) === 0) {
        hit.hp -= weapon.bulletDamage
        hit.flash = 2
        if (hit.hp <= 0) hit.dead = 70
      }
    } else {
      // 点射连发节奏：一轮 burst 发（间隔 burstGap）后进入 fireInterval 冷却（与 player.ts 一致）
      const burst = weapon.burst ?? 1
      const gap = weapon.burstGap ?? 3
      const cycle = weapon.fireInterval + gap * (burst - 1)
      const phase = t % Math.max(1, cycle)
      if (phase % gap === 0 && phase < gap * burst) {
        const aim = -Math.PI / 2 + Math.sin(t * 0.02) * 0.55
        // 弹丸数量随机（与 player.ts 一致）：多发时对称扇形展开
        const pMin = weapon.projectilesMin ?? 1
        const pMax = weapon.projectilesMax ?? pMin
        const count = pMin + Math.floor(Math.random() * (pMax - pMin + 1))
        const fan = ((weapon.pelletFanDeg ?? 5) * Math.PI) / 180
        for (let i = 0; i < count; i++) {
          const pa = aim + (i - (count - 1) / 2) * fan
          wShots.push({
            x: shipX,
            y: SHIP_Y - 10,
            vx: Math.cos(pa) * speed,
            vy: Math.sin(pa) * speed
          })
        }
      }
    }
    // --- 激光束衰减（6 帧视觉残留） ---
    for (const b of wBeams) b.ttl--
    wBeams = wBeams.filter((b) => b.ttl > 0)

    // --- 敌人状态（闪白 / 重生） ---
    for (const e of wEnemies) {
      if (e.flash > 0) e.flash--
      if (e.dead > 0 && --e.dead === 0) {
        e.hp = e.maxHp
      }
    }

    // --- 子弹推进与命中 ---
    for (const s of wShots) {
      s.x += s.vx
      s.y += s.vy
      for (const e of wEnemies) {
        if (e.dead > 0) continue
        if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + 3) {
          e.hp -= weapon.bulletDamage
          e.flash = 2
          s.y = -999 // 标记移除
          if (e.hp <= 0) e.dead = 70
          break
        }
      }
    }
    wShots = wShots.filter(
      (s) =>
        s.y > -50 && s.y < GUIDE_H + 50 && s.x > -50 && s.x < GUIDE_W + 50
    )

    // --- 绘制敌机 ---
    for (const e of wEnemies) {
      if (e.dead > 0) continue
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#f0abfc'
      ctx.shadowColor = '#f0abfc'
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(e.x, e.y + 7)
      ctx.lineTo(e.x - 7, e.y - 5)
      ctx.lineTo(e.x + 7, e.y - 5)
      ctx.closePath()
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // --- 绘制激光束（多层辉光 + 能量流 + 光晕，与 renderer.drawLaserBeams 一致，按比例缩小） ---
    if (wBeams.length > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'
      const now = performance.now()
      const pulse = 0.85 + 0.15 * Math.sin(now / 140)
      for (const b of wBeams) {
        const k = Math.max(0, b.ttl / 6) * pulse
        const line = () => {
          ctx.beginPath()
          ctx.moveTo(b.x1, b.y1)
          ctx.lineTo(b.x2, b.y2)
          ctx.stroke()
        }
        ctx.globalAlpha = 0.16 * k
        ctx.strokeStyle = '#ff8c1e'
        ctx.lineWidth = 11
        line()
        ctx.globalAlpha = 0.32 * k
        ctx.strokeStyle = '#ffb75e'
        ctx.lineWidth = 6
        line()
        ctx.globalAlpha = 0.7 * k
        ctx.strokeStyle = '#ffe9c4'
        ctx.lineWidth = 4
        ctx.setLineDash([18, 24])
        ctx.lineDashOffset = -(now / 1000) * 260
        line()
        ctx.setLineDash([])
        ctx.globalAlpha = 0.95 * k
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2.5
        line()
        // 炮口聚能光球与命中端爆闪
        const glow = (x: number, y: number, r: number) => {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r)
          g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`)
          g.addColorStop(0.4, `rgba(255,183,94,${0.5 * k})`)
          g.addColorStop(1, 'rgba(255,140,30,0)')
          ctx.globalAlpha = 1
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        glow(b.x1, b.y1, 5 + 2 * pulse)
        if (b.hit) glow(b.x2, b.y2, 8 + 2.5 * pulse)
      }
      ctx.restore()
    }

    // --- 绘制火力（弹色取自武器定义） ---
    ctx.fillStyle = weapon.bulletColor
    for (const s of wShots) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- 绘制自机 ---
    ctx.fillStyle = '#7dd3fc'
    ctx.shadowColor = '#7dd3fc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(shipX, SHIP_Y - 12)
    ctx.lineTo(shipX - 8, SHIP_Y + 6)
    ctx.lineTo(shipX + 8, SHIP_Y + 6)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // ==================== 敌人武器演示 ====================

  function resetEnemyWeaponPreview() {
    pBullets = []
  }

  /**
   * 敌人武器页签：顶部敌机按选中武器（weapons/enemyWeapons.ts）持续开火，
   * 自机在底部游走躲避。发射行为与 engine/bullet.ts 的
   * EnemyWeaponEmitter.update() 完全一致：按 fireInterval 发射一颗朝自机的弹丸
   */
  function drawEnemyWeaponPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    const weapon = ENEMY_WEAPONS[selectedEnemyWeapon.value]
    // 激光武器：走光束周期演示（预警 → 照射 → 熄灭 → 休息）
    if (weapon.laser) {
      drawEnemyLaserPreview(ctx, weapon)
      return
    }
    const color = weapon.bulletColor

    // 敌机：顶部中央缓慢漂移
    const ex = GUIDE_W / 2 + Math.sin(t * 0.015) * 40
    const ey = 60
    // 自机：底部游走
    const px = GUIDE_W / 2 + Math.sin(t * 0.03) * 60
    const py = SHIP_Y

    // --- 发射（间隔取武器的 fireInterval，弹速按 480 设计宽等比缩放到预览区） ---
    // 与 engine/bullet.ts 的 EnemyWeaponEmitter.update() 一致：一轮 bulletCount 颗扇形展开
    const speed = weapon.bulletSpeed * (GUIDE_W / 480)
    if (t % Math.max(1, weapon.fireInterval) === 0) {
      const aim = Math.atan2(py - ey, px - ex)
      const n = Math.max(1, weapon.bulletCount ?? 1)
      const DEG = Math.PI / 180
      const total = (weapon.spreadAngle ?? 8 * (n - 1)) * DEG
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? aim : aim - total / 2 + (total * i) / (n - 1)
        pBullets.push({ x: ex, y: ey, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed })
      }
    }

    // --- 子弹推进 ---
    for (const b of pBullets) {
      b.x += b.vx
      b.y += b.vy
    }
    pBullets = pBullets.filter(
      (b) => b.x > -10 && b.x < GUIDE_W + 10 && b.y > -10 && b.y < GUIDE_H + 10
    )

    // --- 绘制敌机（三角） ---
    ctx.fillStyle = '#f0abfc'
    ctx.shadowColor = '#f0abfc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(ex, ey + 7)
    ctx.lineTo(ex - 7, ey - 5)
    ctx.lineTo(ex + 7, ey - 5)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0

    // --- 绘制敌弹 ---
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    for (const b of pBullets) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0

    // --- 绘制自机 ---
    ctx.fillStyle = '#7dd3fc'
    ctx.shadowColor = '#7dd3fc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(px, py - 12)
    ctx.lineTo(px - 8, py + 6)
    ctx.lineTo(px + 8, py + 6)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
  }

  /**
   * 敌人激光武器页签演示：敌机在顶部巡航，按完整周期演示
   * 预警线 → 全功率光束 → 熄灭残影 → 休息。
   * 光束基准角锁定自机方位，sweep 模式照射期间横扫扇面，
   * 周期与局内状态机（engine/bullet.ts + game.ts updateEnemyLasers）一致。
   */
  function drawEnemyLaserPreview(
    ctx: CanvasRenderingContext2D,
    weapon: (typeof ENEMY_WEAPONS)[EnemyWeaponKey]
  ) {
    const L = weapon.laser!
    const color = weapon.bulletColor

    // 敌机：顶部中央缓慢漂移；自机：底部游走
    const ex = GUIDE_W / 2 + Math.sin(t * 0.015) * 40
    const ey = 60
    const px = GUIDE_W / 2 + Math.sin(t * 0.03) * 60
    const py = SHIP_Y

    // 完整周期切分（与局内一致：telegraph → duration → fade → rest）
    const cycle = L.telegraph + L.duration + L.fade + L.rest
    const ct = t % cycle
    const phase =
      ct < L.telegraph
        ? 'telegraph'
        : ct < L.telegraph + L.duration
          ? 'firing'
          : ct < L.telegraph + L.duration + L.fade
            ? 'fading'
            : 'rest'

    // 基准角锁定自机方位（照射期间固定，与局内一致）
    const base = Math.atan2(py - ey, px - ex)
    const angle = base
    let k = 1
    if (phase === 'telegraph') {
      k = 0.25 + 0.75 * (ct / L.telegraph)
    } else if (phase === 'fading') {
      k = Math.max(0, 1 - (ct - L.telegraph - L.duration) / L.fade)
    } else if (phase === 'rest') {
      k = 0 // rest：无光束
    }

    // 预览区尺寸等比缩放（以 480 设计宽为基准）
    const scale = GUIDE_W / 480
    const spacing = L.spacing * scale
    const halfW = L.halfWidth * scale
    const count = Math.max(1, L.count)

    // 单条光束绘制：外层辉光 + 白芯 + 炮口光球
    const drawBeam = (
      sx: number,
      sy: number,
      a: number,
      alpha: number,
      beamColor: string
    ) => {
      const dx = Math.cos(a) * (GUIDE_W + GUIDE_H)
      const dy = Math.sin(a) * (GUIDE_W + GUIDE_H)
      ctx.lineCap = 'round'
      ctx.strokeStyle = beamColor
      ctx.globalAlpha = 0.16 * alpha
      ctx.lineWidth = halfW * 2 + 8
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + dx, sy + dy)
      ctx.stroke()
      ctx.strokeStyle = '#ffffff'
      ctx.globalAlpha = 0.85 * alpha
      ctx.lineWidth = Math.max(1.5, halfW * 0.4)
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + dx, sy + dy)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(2, halfW * 0.9), 0, Math.PI * 2)
      ctx.fill()
    }

    if (phase !== 'rest') {
      // 排布与局内一致：count > 1 时沿基准角法线方向排布平行光束
      for (let i = 0; i < count; i++) {
        const o = (i - (count - 1) / 2) * spacing
        const ox = Math.cos(angle + Math.PI / 2) * o
        const oy = Math.sin(angle + Math.PI / 2) * o
        drawBeam(ex + ox, ey + oy, angle, k, color)
      }
    }
    ctx.globalAlpha = 1

    // 绘制敌机（菱形，呼应棱镜造型）
    ctx.fillStyle = '#7de8ff'
    ctx.shadowColor = '#7de8ff'
    ctx.shadowBlur = 10
    ctx.save()
    ctx.translate(ex, ey)
    ctx.rotate(t * 0.02)
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.lineTo(8, 0)
    ctx.lineTo(0, 10)
    ctx.lineTo(-8, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.shadowBlur = 0

    // 绘制自机
    ctx.fillStyle = '#7dd3fc'
    ctx.shadowColor = '#7dd3fc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(px, py - 12)
    ctx.lineTo(px - 8, py + 6)
    ctx.lineTo(px + 8, py + 6)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // ==================== 角色演示 ====================

  /** 角色皮肤按需加载（与局内同一套 SpriteManager 机制，加载失败回退占位绘制） */
  const charSprites = new SpriteManager()
  const charSpriteRequested = new Set<string>()

  /** 按动作名取片段：与 renderer.ts 的 pickClip 一致（缺失回退 move，再回退第一个片段） */
  function pickClip(anim: SpriteAnim, name: string) {
    return (
      anim.animations[name] ??
      anim.animations['move'] ??
      Object.values(anim.animations)[0] ??
      null
    )
  }

  /**
   * 角色页签：角色飞行动画演示。
   * 巡航轨迹为横向往返 + 纵向浮动；动作切换与 player.ts 一致：
   * 右移播 right、左移自动镜像（flip）、其余播 move。
   * 皮肤加载失败/未配置时回退角色配色的占位三角。
   */
  function drawCharacterPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    const char =
      CHARACTERS.find((c) => c.key === selectedCharacter.value) ?? CHARACTERS[0]!

    // --- 巡航轨迹 ---
    const x = GUIDE_W / 2 + Math.sin(t * 0.02) * (GUIDE_W / 2 - 34)
    const y = GUIDE_H / 2 - 10 + Math.sin(t * 0.055) * 26
    // 横向移动方向（轨迹导数符号），死区避免换向瞬间动作抖动
    const dir = Math.cos(t * 0.02)
    const animName = dir > 0.2 ? 'right' : 'move'
    const flip = dir < -0.2

    cTrail.push({ x, y })
    if (cTrail.length > 70) cTrail.shift()

    // --- 皮肤（异步加载，未就绪时走占位绘制） ---
    let img: HTMLImageElement | null = null
    let spriteAnim: SpriteAnim | null = null
    if (char.sprite) {
      if (!charSpriteRequested.has(char.key)) {
        charSpriteRequested.add(char.key)
        void charSprites.loadSprite(char.key, char.sprite)
      }
      img = charSprites.getSprite(char.key)
      spriteAnim = charSprites.getSpriteAnim(char.key)
    }

    // --- 尾迹（角色配色，越远越淡） ---
    for (let i = 0; i < cTrail.length; i++) {
      const p = cTrail[i]!
      const a = (i / cTrail.length) * 0.45
      ctx.globalAlpha = a
      ctx.fillStyle = char.color
      ctx.beginPath()
      ctx.arc(p.x, p.y + 10, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // --- 本体 ---
    ctx.save()
    ctx.translate(x, y)
    if (flip) ctx.scale(-1, 1)
    if (img) {
      // 序列帧：按动作取片段，fps 与素材配置一致（预览 rAF ≈ 60fps）
      const clip = spriteAnim ? pickClip(spriteAnim, animName) : null
      let sx = 0
      let sw = img.naturalWidth
      let sh = img.naturalHeight
      if (clip && spriteAnim) {
        const fps = clip.fps ?? spriteAnim.fps
        const frame = Math.floor((t * fps) / 60) % clip.length
        sx = (clip.start + frame) * spriteAnim.frameWidth
        sw = spriteAnim.frameWidth
        sh = spriteAnim.frameHeight
      }
      const dh = 48
      const dw = (dh * sw) / sh
      ctx.drawImage(img, sx, 0, sw, sh, -dw / 2, -dh / 2, dw, dh)
    } else {
      // 占位三角（角色主色 + 高光描边，与局内占位绘制风格一致）
      ctx.fillStyle = char.color
      ctx.strokeStyle = char.accent
      ctx.lineWidth = 1.5
      ctx.shadowColor = char.color
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.moveTo(0, -12)
      ctx.lineTo(-9, 8)
      ctx.lineTo(9, 8)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    ctx.restore()

    // --- 判定点（小判定提示，半径按预览比例缩放） ---
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, 5.5, 0, Math.PI * 2)
    ctx.stroke()

    // --- 状态文本 ---
    ctx.font = '10px ui-monospace, Consolas, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(`${char.name} // ${animName.toUpperCase()}${flip ? ' (MIRROR)' : ''}`, 8, 16)
  }

  // ==================== 技能演示 ====================

  function resetSkillPreview() {
    sEnemies = [
      { x: 50, y: -20, vy: 0.5, fireT: 30 },
      { x: 120, y: -80, vy: 0.4, fireT: 55 },
      { x: 190, y: -40, vy: 0.6, fireT: 75 }
    ]
    sBullets = []
    sShots = []
    sTrail = []
    sFireCd = 0
    empWave = 0
    empStun = 0
    gemAngle = 0
    gemSparks = []
  }

  /**
   * 技能页签：突触超频 —— 与局内逻辑一致：
   * 敌人与敌弹 ×0.12 近乎凝滞，自机移动、武器射速与弹速均不受影响；
   * 特效为冷绿色滤镜 + 扫描线 + 自机彩虹残影（周期压缩为 7 秒循环演示）
   */
  function drawSkillPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    const cycle = t % 420
    const active = cycle >= 120 && cycle < 270
    const scale = active ? 0.12 : 1

    // 自机：仅移动不受减速影响，始终正常速度穿梭
    const px = GUIDE_W / 2 + Math.sin(t * 0.055) * 70
    const py = SHIP_Y

    // 自机武器：不受时缓影响，射速与弹速保持原速（与 player.ts / game.ts 一致）
    if (--sFireCd <= 0) {
      sFireCd = 10
      sShots.push({ x: px - 5, y: py - 12 }, { x: px + 5, y: py - 12 })
    }
    for (const s of sShots) s.y -= 5
    sShots = sShots.filter((s) => s.y > -10)

    // 彩虹残影：激活时每 3 帧采样，结束后逐帧消散（与 player.ts 一致）
    if (active) {
      if (t % 3 === 0) {
        sTrail.push({ x: px, y: py })
        if (sTrail.length > 14) sTrail.shift()
      }
    } else if (sTrail.length > 0) {
      sTrail.shift()
    }

    // --- 敌人移动与开火（受时间缩放影响） ---
    for (const e of sEnemies) {
      e.y += e.vy * scale
      if (e.y > GUIDE_H + 20) {
        e.y = -20
        e.x = 30 + ((t * 53) % (GUIDE_W - 60))
      }
      e.fireT -= scale
      if (e.fireT <= 0 && e.y > 0 && e.y < GUIDE_H - 60) {
        e.fireT = 45
        const a = Math.atan2(py - e.y, px - e.x)
        sBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 })
      }
    }
    for (const b of sBullets) {
      b.x += b.vx * scale
      b.y += b.vy * scale
    }
    sBullets = sBullets.filter(
      (b) => b.x > -10 && b.x < GUIDE_W + 10 && b.y > -10 && b.y < GUIDE_H + 10
    )

    // --- 敌机 ---
    for (const e of sEnemies) {
      if (e.y < -10) continue
      ctx.fillStyle = '#f0abfc'
      ctx.shadowColor = '#f0abfc'
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(e.x, e.y + 7)
      ctx.lineTo(e.x - 7, e.y - 5)
      ctx.lineTo(e.x + 7, e.y - 5)
      ctx.closePath()
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // --- 敌弹 ---
    ctx.fillStyle = '#f0abfc'
    for (const b of sBullets) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- 自机弹（减速期间飞行明显变慢、弹道变密） ---
    ctx.fillStyle = '#7dd3fc'
    for (const s of sShots) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- 彩虹残影（lighter 叠加，画在自机下层） ---
    if (sTrail.length > 1) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < sTrail.length; i++) {
        const p = sTrail[i]!
        const ratio = (i + 1) / sTrail.length
        const [r, g, b] = skillTrailColor(ratio)
        ctx.fillStyle = `rgba(${r},${g},${b},${0.1 + ratio * 0.35})`
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - 12)
        ctx.lineTo(p.x - 8, p.y + 6)
        ctx.lineTo(p.x + 8, p.y + 6)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }

    // --- 自机本体 ---
    ctx.fillStyle = '#7dd3fc'
    ctx.shadowColor = '#7dd3fc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(px, py - 12)
    ctx.lineTo(px - 8, py + 6)
    ctx.lineTo(px + 8, py + 6)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0

    // --- 滤镜（与 renderer.ts drawSandevistanOverlay 同款：冷绿色调 + 暗角 + 扫描线） ---
    if (active) {
      ctx.fillStyle = 'rgba(52, 211, 153, 0.08)'
      ctx.fillRect(0, 0, GUIDE_W, GUIDE_H)
      const grad = ctx.createRadialGradient(
        GUIDE_W / 2, GUIDE_H / 2, GUIDE_H * 0.25,
        GUIDE_W / 2, GUIDE_H / 2, GUIDE_H * 0.7
      )
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(0.7, 'rgba(6, 78, 59, 0.18)')
      grad.addColorStop(1, 'rgba(2, 44, 34, 0.45)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, GUIDE_W, GUIDE_H)
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#34d399'
      const offset = (t * 0.5) % 4
      for (let y = offset; y < GUIDE_H; y += 4) ctx.fillRect(0, y, GUIDE_W, 1)
      ctx.globalAlpha = 1
    }

    // --- 状态文本与技能条 ---
    ctx.font = '10px ui-monospace, Consolas, monospace'
    ctx.fillStyle = active ? '#34d399' : 'rgba(255,255,255,0.55)'
    ctx.fillText(
      active ? '突触超频 TIME ×0.12' : cycle < 120 ? '冷却中…' : '技能就绪',
      8,
      16
    )
    const ratio = active
      ? 1 - (cycle - 120) / 150
      : cycle < 120
        ? cycle / 120
        : 1
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(8, GUIDE_H - 12, GUIDE_W - 16, 4)
    ctx.fillStyle = '#34d399'
    ctx.fillRect(8, GUIDE_H - 12, (GUIDE_W - 16) * ratio, 4)
  }

  /**
   * 技能页签：电磁脉冲（EMP）—— 与局内逻辑一致：
   * 周期性释放全向冲击波，清空场上敌弹，并干扰敌机使其不能移动与开火
   * （6 秒循环：4.3 秒常态 → 释放冲击波 → 2.3 秒干扰冻结）
   */
  function drawEmpSkillPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    const cycle = t % 360
    const stunned = empStun > 0

    // 自机：正常速度穿梭
    const px = GUIDE_W / 2 + Math.sin(t * 0.055) * 70
    const py = SHIP_Y

    // 自机武器（不受 EMP 影响）
    if (--sFireCd <= 0) {
      sFireCd = 10
      sShots.push({ x: px - 5, y: py - 12 }, { x: px + 5, y: py - 12 })
    }
    for (const s of sShots) s.y -= 5
    sShots = sShots.filter((s) => s.y > -10)

    // 周期性释放 EMP：冲击波扩散 + 清弹 + 干扰
    if (cycle === 100) {
      empWave = 0.02
      empStun = 140
      sBullets = [] // 清空敌弹（局内为逐颗化作电火花）
    }
    if (empStun > 0) empStun--

    // --- 敌人移动与开火（干扰期间完全冻结） ---
    for (const e of sEnemies) {
      if (!stunned) {
        e.y += e.vy
        if (e.y > GUIDE_H + 20) {
          e.y = -20
          e.x = 30 + ((t * 53) % (GUIDE_W - 60))
        }
        e.fireT--
        if (e.fireT <= 0 && e.y > 0 && e.y < GUIDE_H - 60) {
          e.fireT = 45
          const a = Math.atan2(py - e.y, px - e.x)
          sBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 })
        }
      }
    }
    for (const b of sBullets) {
      b.x += b.vx
      b.y += b.vy
    }
    sBullets = sBullets.filter(
      (b) => b.x > -10 && b.x < GUIDE_W + 10 && b.y > -10 && b.y < GUIDE_H + 10
    )

    // --- 敌机（干扰期间蒙上青色 + 抖动错位，模拟电子故障） ---
    for (const e of sEnemies) {
      if (e.y < -10) continue
      const glitch = stunned && t % 4 < 2
      const ex = glitch ? e.x + (Math.random() - 0.5) * 3 : e.x
      ctx.fillStyle = stunned ? '#67e8f9' : '#f0abfc'
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(ex, e.y + 7)
      ctx.lineTo(ex - 7, e.y - 5)
      ctx.lineTo(ex + 7, e.y - 5)
      ctx.closePath()
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // --- 敌弹 ---
    ctx.fillStyle = '#f0abfc'
    for (const b of sBullets) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- 自机弹 ---
    ctx.fillStyle = '#7dd3fc'
    for (const s of sShots) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- 自机本体 ---
    ctx.fillStyle = '#7dd3fc'
    ctx.shadowColor = '#7dd3fc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(px, py - 12)
    ctx.lineTo(px - 8, py + 6)
    ctx.lineTo(px + 8, py + 6)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0

    // --- 冲击波：两层扩散环（lighter 叠加） ---
    if (empWave > 0) {
      empWave += 0.028
      if (empWave >= 1) {
        empWave = 0
      } else {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const r = empWave * GUIDE_W * 0.85
        const fade = 1 - empWave
        ctx.strokeStyle = `rgba(103, 232, 249, ${0.85 * fade})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = `rgba(165, 243, 252, ${0.5 * fade})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(px, py, r * 0.8, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }

    // --- 状态文本与能量条 ---
    ctx.font = '10px ui-monospace, Consolas, monospace'
    ctx.fillStyle = stunned ? '#67e8f9' : 'rgba(255,255,255,0.55)'
    ctx.fillText(stunned ? '电磁脉冲 EMP // 干扰中' : cycle < 100 ? 'EMP 就绪' : '能量回复中…', 8, 16)
    const ratio = cycle < 100 ? 1 : Math.min(1, (cycle - 100) / 260)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(8, GUIDE_H - 12, GUIDE_W - 16, 4)
    ctx.fillStyle = '#67e8f9'
    ctx.fillRect(8, GUIDE_H - 12, (GUIDE_W - 16) * ratio, 4)
  }

  /**
   * 技能页签：双子星卫（Castor & Pollux）—— 与局内逻辑一致：
   * 两颗金色卫星对角环绕自机，撞毁触碰到的敌弹（8 秒循环：2 秒充能 → 5 秒卫星护航 → 1 秒结束缓冲）
   */
  function drawGeminiSkillPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    const cycle = t % 480
    const active = cycle >= 120 && cycle < 420

    // 自机：正常速度穿梭
    const px = GUIDE_W / 2 + Math.sin(t * 0.055) * 70
    const py = SHIP_Y

    // 自机武器
    if (--sFireCd <= 0) {
      sFireCd = 10
      sShots.push({ x: px - 5, y: py - 12 }, { x: px + 5, y: py - 12 })
    }
    for (const s of sShots) s.y -= 5
    sShots = sShots.filter((s) => s.y > -10)

    // --- 敌人移动与开火（常态，不受卫星影响） ---
    for (const e of sEnemies) {
      e.y += e.vy
      if (e.y > GUIDE_H + 20) {
        e.y = -20
        e.x = 30 + ((t * 53) % (GUIDE_W - 60))
      }
      e.fireT--
      if (e.fireT <= 0 && e.y > 0 && e.y < GUIDE_H - 60) {
        e.fireT = 45
        const a = Math.atan2(py - e.y, px - e.x)
        sBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 })
      }
    }
    for (const b of sBullets) {
      b.x += b.vx
      b.y += b.vy
    }

    // --- 双子卫星：激活时推进轨道角并吞噬碰到的敌弹 ---
    const orbitR = 30
    const orbR = 6
    if (active) {
      gemAngle += 3.2 * (Math.PI / 180)
      sBullets = sBullets.filter((b) => {
        for (let i = 0; i < 4; i++) {
          const a = gemAngle + (i * Math.PI) / 2
          const ox = px + Math.cos(a) * orbitR
          const oy = py + Math.sin(a) * orbitR
          if (Math.hypot(b.x - ox, b.y - oy) < orbR + 2.5) {
            gemSparks.push({ x: b.x, y: b.y, ttl: 12 })
            return false
          }
        }
        return true
      })
    }
    sBullets = sBullets.filter(
      (b) => b.x > -10 && b.x < GUIDE_W + 10 && b.y > -10 && b.y < GUIDE_H + 10
    )
    for (const s of gemSparks) s.ttl--
    gemSparks = gemSparks.filter((s) => s.ttl > 0)

    // --- 敌机 ---
    for (const e of sEnemies) {
      if (e.y < -10) continue
      ctx.fillStyle = '#f0abfc'
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(e.x, e.y + 7)
      ctx.lineTo(e.x - 7, e.y - 5)
      ctx.lineTo(e.x + 7, e.y - 5)
      ctx.closePath()
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // --- 敌弹 ---
    ctx.fillStyle = '#f0abfc'
    for (const b of sBullets) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- 自机弹 ---
    ctx.fillStyle = '#7dd3fc'
    for (const s of sShots) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- 自机本体 ---
    ctx.fillStyle = '#7dd3fc'
    ctx.shadowColor = '#7dd3fc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(px, py - 12)
    ctx.lineTo(px - 8, py + 6)
    ctx.lineTo(px + 8, py + 6)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0

    // --- 双子卫星：轨道环 + 金色光球（叠加混合） ---
    if (active) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.16)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(px, py, orbitR, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 4; i++) {
        const a = gemAngle + (i * Math.PI) / 2
        const ox = px + Math.cos(a) * orbitR
        const oy = py + Math.sin(a) * orbitR
        ctx.fillStyle = 'rgba(217, 164, 32, 0.9)'
        ctx.beginPath()
        ctx.arc(ox, oy, orbR * 0.8, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // --- 挡弹火花 ---
    for (const s of gemSparks) {
      ctx.fillStyle = `rgba(251, 191, 36, ${s.ttl / 12})`
      ctx.beginPath()
      ctx.arc(s.x, s.y, 3 * (s.ttl / 12) + 1, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- 状态文本与能量条 ---
    ctx.font = '10px ui-monospace, Consolas, monospace'
    ctx.fillStyle = active ? '#fbbf24' : 'rgba(255,255,255,0.55)'
    ctx.fillText(active ? '双子星卫 // 护航中' : '双子星卫 // 充能中…', 8, 16)
    const ratio = active ? 1 - (cycle - 120) / 300 : Math.min(1, cycle / 120)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(8, GUIDE_H - 12, GUIDE_W - 16, 4)
    ctx.fillStyle = active ? '#fbbf24' : '#7dd3fc'
    ctx.fillRect(8, GUIDE_H - 12, (GUIDE_W - 16) * ratio, 4)
  }

  // ==================== 敌人轨迹演示 ====================

  /** 轨迹预览状态：当前敌人位置与路径帧计数 */
  let pathX = GUIDE_W / 2
  let pathY = -20
  let pathT = 0
  /** 轨迹残影采样点 */
  let pathTrail: { x: number; y: number }[] = []
  /** orbit 追踪环绕专用状态 */
  let orbitAimX = GUIDE_W / 2
  let orbitAimY = GUIDE_H / 2
  let orbitAngle = 0
  let orbitPhase: 'path' | 'engage' = 'path'
  let orbitDir: 1 | -1 = 1
  /** orbit 演示用的模拟自机位置（做正弦漂移以展示追踪效果） */
  let simPlayerX = GUIDE_W / 2
  let simPlayerY = GUIDE_H / 2

  function resetEnemyPathPreview() {
    pathX = GUIDE_W / 2
    pathY = -20
    pathT = 0
    pathTrail = []
    orbitAimX = GUIDE_W / 2
    orbitAimY = GUIDE_H / 2
    orbitAngle = 0
    orbitPhase = 'path'
    orbitDir = 1
    simPlayerX = GUIDE_W / 2
    simPlayerY = GUIDE_H / 2
  }

  /**
   * 敌人轨迹页签：按选中路径类型在画布中演示敌人移动。
   * 所有运动公式与 engine/enemy.ts move() 的对应 case 完全一致。
   * 敌人离开画面后自动从顶部重生，形成循环演示。
   */
  function drawEnemyPathPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    const pathType = selectedEnemyPath.value
    const speed = 1.5
    const baseX = GUIDE_W / 2
    const DEG = Math.PI / 180

    // --- 计算当前位置（与 enemy.ts move() 各 case 一致） ---
    pathT++
    let x = pathX
    let y = pathY
    const sy = 1 // preview 下 scaleY 恒为 1

    switch (pathType) {
      case 'straight':
        x = baseX
        y += speed
        break
      case 'sine':
        x = baseX + Math.sin(pathT * 0.04) * 70 * sy
        y += speed * 0.7
        break
      case 'dive-left':
        x -= speed * 0.5
        y += speed
        break
      case 'dive-right':
        x += speed * 0.5
        y += speed
        break
      case 'hover':
        if (pathT <= 90) {
          y += speed
        } else if (pathT <= 420) {
          x = baseX + Math.sin((pathT - 90) * 0.02) * 40 * sy
        } else {
          y += speed * 1.5
        }
        break
      case 'zigzag':
        y += speed * 0.8
        x += (Math.floor(pathT / 45) % 2 === 0 ? 1 : -1) * speed * 0.6
        break
      case 'loop': {
        const centerY = Math.max(0, (pathT * speed * 0.45) / sy - 40)
        const radius = 65 * sy
        const angle = pathT * 0.05
        x = baseX + Math.sin(angle) * radius
        y = centerY + Math.cos(angle) * radius
        break
      }
      case 'rush':
        y += speed * Math.min(2.2, 0.4 + pathT * 0.02)
        break
      case 'sweep-left':
        if (pathT <= 40) {
          y += speed
        } else {
          x -= speed * 1.2
          y += speed * 0.15
        }
        break
      case 'sweep-right':
        if (pathT <= 40) {
          y += speed
        } else {
          x += speed * 1.2
          y += speed * 0.15
        }
        break
      case 'orbit': {
        // 模拟自机在画面中缓慢漂移（展示追踪/环绕效果）
        simPlayerX = GUIDE_W / 2 + Math.sin(pathT * 0.02) * 60
        simPlayerY = GUIDE_H / 2 + Math.cos(pathT * 0.025) * 40
        // 低通滤波感知（trackResponse = 0.045）
        const resp = 0.045
        orbitAimX += (simPlayerX - orbitAimX) * resp
        orbitAimY += (simPlayerY - orbitAimY) * resp
        // 入场阶段：直线下落 90 帧（与 enemyAi.engageAfter 一致）
        if (pathT < 90) {
          x = baseX
          y += speed
        } else {
          if (orbitPhase === 'path') {
            orbitPhase = 'engage'
            orbitAngle = Math.atan2(y - orbitAimY, x - orbitAimX)
          }
          const R = 48
          const sp = speed * 2.0
          const dx = orbitAimX - x
          const dy = orbitAimY - y
          const dist = Math.hypot(dx, dy) || 1
          if (dist > R * 1.15) {
            // 直线逼近
            x += (dx / dist) * sp
            y += (dy / dist) * sp
            orbitAngle = Math.atan2(y - orbitAimY, x - orbitAimX)
          } else {
            // 环绕
            orbitAngle += orbitDir * 1.4 * DEG
            const tx = orbitAimX + Math.cos(orbitAngle) * R
            const ty = orbitAimY + Math.sin(orbitAngle) * R
            const mx = tx - x
            const my = ty - y
            const md = Math.hypot(mx, my)
            if (md > 0.5) {
              const step = Math.min(sp, md)
              x += (mx / md) * step
              y += (my / md) * step
            }
          }
        }
        break
      }
    }

    pathX = x
    pathY = y
    pathTrail.push({ x, y })
    if (pathTrail.length > 120) pathTrail.shift()

    // 普通路径：敌人离开画面后重生  /  orbit：演示约 700 帧后重置循环
    if (pathType === 'orbit') {
      if (pathT > 700) {
        resetEnemyPathPreview()
      }
    } else if (y > GUIDE_H + 40 || x < -40 || x > GUIDE_W + 40) {
      pathX = baseX + (Math.random() - 0.5) * 80
      pathY = -30
      pathT = 0
      pathTrail = []
    }

    // --- 绘制轨迹尾迹（越新越亮） ---
    for (let i = 0; i < pathTrail.length; i++) {
      const p = pathTrail[i]!
      const alpha = 0.08 + (i / pathTrail.length) * 0.4
      ctx.fillStyle = `rgba(240, 171, 252, ${alpha})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- orbit 模式：绘制模拟自机位置（半透明白点） ---
    if (pathType === 'orbit') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(simPlayerX, simPlayerY, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // --- 绘制敌人本体（紫红色三角，居中） ---
    const ex = pathX
    const ey = pathY
    const size = 7
    ctx.fillStyle = orbitPhase === 'engage' ? '#fb923c' : '#f0abfc'
    ctx.shadowColor = orbitPhase === 'engage' ? '#fb923c' : '#f0abfc'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(ex, ey + size)
    ctx.lineTo(ex - size, ey - size * 0.7)
    ctx.lineTo(ex + size, ey - size * 0.7)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0

    // --- 标注轨迹类型 ---
    const pathLabels: Record<string, string> = {
      straight: '直线下落',
      sine: '正弦摆动',
      'dive-left': '左斜冲',
      'dive-right': '右斜冲',
      hover: '悬停漂移',
      zigzag: '锯齿下落',
      loop: '回旋下落',
      rush: '加速俯冲',
      'sweep-left': '左横扫',
      'sweep-right': '右横扫',
      orbit: '追踪环绕'
    }
    ctx.font = '10px ui-monospace, Consolas, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    const phaseLabel = pathType === 'orbit' ? (orbitPhase === 'engage' ? ' (ENGAGE)' : ' (PATH)') : ''
    ctx.fillText(`${pathType.toUpperCase()} // ${pathLabels[pathType] ?? pathType}${phaseLabel}`, 8, 16)
  }

  // ==================== 敌人行为演示 ====================

  /** 行为演示敌人列表 */
  let behaviorEnemies: { x: number; y: number; px: number; py: number; vx: number; vy: number; color: string; r: number; alive: boolean; fired?: number }[] = []
  let behaviorT = 0
  let behaviorBullets: { x: number; y: number; vx: number; vy: number }[] = []
  let behaviorPlayerX = GUIDE_W / 2
  let behaviorPlayerY = GUIDE_H - 30

  function resetBehaviorPreview() {
    behaviorT = 0
    behaviorEnemies = []
    behaviorBullets = []
    behaviorPlayerX = GUIDE_W / 2
    behaviorPlayerY = GUIDE_H - 30
  }

  function drawEnemyBehaviorPreview(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, GUIDE_W, GUIDE_H)
    behaviorT++
    const bt = selectedEnemyBehavior.value

    // --- 初始化敌人 ---
    if (behaviorEnemies.length === 0) {
      const N = bt === 'flock' ? 6 : bt === 'guard' ? 5 : 3
      for (let i = 0; i < N; i++) {
        // flock / guard 出生在屏幕可见区域内，避免从屏幕外飞入
        let sy = -10 - i * 18
        if (bt === 'guard') sy = GUIDE_H * 0.3
        if (bt === 'flock') sy = GUIDE_H * 0.35 + (i - N / 2) * 15
        behaviorEnemies.push({
          x: GUIDE_W / 2 + (i - N / 2) * 22,
          y: sy,
          px: 0, py: 0,
          vx: 0, vy: bt === 'flock' ? 0 : 1.2,
          color: bt === 'ambush' ? '#fb923c' : bt === 'flock' ? '#67e8f9' : '#f0abfc',
          r: 6, alive: true
        })
      }
    }

    // --- 自机移动（模拟玩家走位） ---
    behaviorPlayerX = GUIDE_W / 2 + Math.sin(behaviorT * 0.015) * 70
    behaviorPlayerY = GUIDE_H - 30 + Math.cos(behaviorT * 0.02) * 15

    // --- 弹幕发射（用于 evade 演示：自机向敌人位置射击） ---
    if (bt === 'evade' && behaviorT % 8 === 0) {
      const tx = behaviorEnemies[0]?.x ?? GUIDE_W / 2
      const ty = (behaviorEnemies[0]?.y ?? 60)
      for (let i = 0; i < 2; i++) {
        const ang = Math.atan2(ty - behaviorPlayerY, tx - behaviorPlayerX) + (i - 0.5) * 0.15
        behaviorBullets.push({ x: behaviorPlayerX, y: behaviorPlayerY, vx: Math.cos(ang) * 2.8, vy: Math.sin(ang) * 2.8 })
      }
    }

    // --- 更新弹幕 ---
    for (const b of behaviorBullets) { b.x += b.vx; b.y += b.vy }
    behaviorBullets = behaviorBullets.filter((b) => b.x > 0 && b.x < GUIDE_W && b.y > 0 && b.y < GUIDE_H)

    // --- 更新敌人（按行为类型） ---
    const speed = 1.2
    for (const e of behaviorEnemies) {
      if (!e.alive) continue
      e.px = e.x; e.py = e.y
      if (bt !== 'flock') e.y += e.vy

      if (bt === 'flock') {
        // 鸟群：分离 + 对齐 + 凝聚简版
        let sepX = 0, sepY = 0, alignX = 0, alignY = 0, cohX = 0, cohY = 0
        let nAlign = 0, nCoh = 0
        for (const o of behaviorEnemies) {
          if (o === e || !o.alive) continue
          const dx = e.x - o.x, dy = e.y - o.y
          const d = Math.hypot(dx, dy) || 1
          if (d < 25) { sepX += (dx / d) * (25 - d) * 0.03; sepY += (dy / d) * (25 - d) * 0.03 }
          if (d < 90) { alignX += o.vx; alignY += o.vy; nAlign++ }
          if (d < 120) { cohX += o.x; cohY += o.y; nCoh++ }
        }
        if (nAlign > 0) { e.vx += ((alignX / nAlign) - e.vx) * 0.02; e.vy += ((alignY / nAlign) - e.vy) * 0.02 }
        if (nCoh > 0) { const ax = (cohX / nCoh) - e.x; const ay = (cohY / nCoh) - e.y; e.vx += ax * 0.003; e.vy += ay * 0.003 }
        e.x += sepX; e.y += sepY
        e.x += e.vx; e.y += e.vy
        // 屏幕边界平滑排斥（避免卡边缘）
        const m = 16
        if (e.x < m) e.vx += (m - e.x) * 0.02
        if (e.x > GUIDE_W - m) e.vx -= (e.x - (GUIDE_W - m)) * 0.02
        if (e.y < 30) e.vy += (30 - e.y) * 0.02
        if (e.y > GUIDE_H - 20) e.vy -= (e.y - (GUIDE_H - 20)) * 0.02
        // 轻微阻尼防止速度发散
        e.vx *= 0.9995
        e.vy *= 0.9995
      } else if (bt === 'evade') {
        // 回避弹幕
        let evadeX = 0, evadeY = 0
        for (const b of behaviorBullets) {
          const dx = e.x - b.x, dy = e.y - b.y
          const d = Math.hypot(dx, dy) || 1
          if (d < 80) { const danger = 1 / d; evadeX += (dx / d) * danger * 30; evadeY += (dy / d) * danger * 30 }
        }
        e.x += evadeX * 0.25; e.y += evadeY * 0.25
        // 慢慢下降
        e.x += Math.sin(behaviorT * 0.02) * 0.4
        if (e.y > GUIDE_H + 40) { e.y = -20; e.x = GUIDE_W / 2 + (Math.random() - 0.5) * 100 }
      } else if (bt === 'guard') {
        // 护卫：队长在屏幕中线巡逻，护卫绕圈
        const leader = behaviorEnemies[0]!
        // 队长 8 字形巡逻，始终在屏幕内
        if (e === leader) {
          e.x = GUIDE_W / 2 + Math.sin(behaviorT * 0.012) * 70
          e.y = GUIDE_H * 0.35 + Math.sin(behaviorT * 0.008) * 40
          e.vy = 0
        }
        if (e !== leader && leader.alive) {
          const idx = behaviorEnemies.indexOf(e)
          const angle = behaviorT * 0.025 + (idx * Math.PI * 2) / (behaviorEnemies.length - 1)
          const R = 48
          const tx = leader.x + Math.cos(angle) * R
          const ty = leader.y + Math.sin(angle) * R
          // 护卫到达目标位置才绕圈（避免初始帧乱跳）
          const dx = tx - e.x, dy = ty - e.y
          const dist = Math.hypot(dx, dy)
          const lerp = dist < 20 ? 0.08 : 0.15
          e.x += dx * lerp
          e.y += dy * lerp
        }
      } else if (bt === 'ambush') {
        // 伏击：入场 → 微移待机 → 触发冲刺
        if (!(e as any)._ambushState) {
          (e as any)._ambushState = 'waiting'
          ;(e as any)._ambushWaitX = e.x
          ;(e as any)._ambushWaitY = e.y
        }
        if ((e as any)._ambushState === 'waiting') {
          e.x += Math.sin(behaviorT * 0.02 + behaviorEnemies.indexOf(e)) * 0.4
          e.y += Math.sin(behaviorT * 0.03 + behaviorEnemies.indexOf(e)) * 0.3
          const dist = Math.hypot(behaviorPlayerX - e.x, behaviorPlayerY - e.y)
          if (dist < 130 && behaviorT > 60) {
            ;(e as any)._ambushState = 'dashing'
            ;(e as any)._ambushAngle = Math.atan2(behaviorPlayerY - e.y + 20, behaviorPlayerX - e.x)
          }
        } else if ((e as any)._ambushState === 'dashing') {
          e.x += Math.cos((e as any)._ambushAngle) * speed * 3.5
          e.y += Math.sin((e as any)._ambushAngle) * speed * 3.5
          if (e.y > GUIDE_H + 40 || e.x < -40 || e.x > GUIDE_W + 40) {
            e.alive = false
          }
        }
      }

      if (e.y > GUIDE_H + 40) { e.alive = false; e.fired = undefined as any }
      if (e.x < -40 || e.x > GUIDE_W + 40) { e.alive = false }
    }

    // 重生死敌机（伏击场景更早重生，避免空白）
    let anyAlive = false
    for (const e of behaviorEnemies) { if (e.alive) anyAlive = true }
    for (const e of behaviorEnemies) {
      if (!e.alive && (!anyAlive || behaviorT % 50 < 3)) {
        e.alive = true
        e.x = GUIDE_W / 2 + (Math.random() - 0.5) * 80
        e.y = -20
        e.vx = 0; e.vy = 1.2
        ;(e as any)._ambushState = undefined
      }
    }

    // --- 绘制弹幕 ---
    for (const b of behaviorBullets) {
      ctx.fillStyle = 'rgba(251,191,36,0.7)'
      ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, Math.PI * 2); ctx.fill()
    }

    // --- 绘制自机 ---
    ctx.fillStyle = '#a78bfa'
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(behaviorPlayerX, behaviorPlayerY, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // --- 绘制敌人 ---
    for (const e of behaviorEnemies) {
      if (!e.alive) continue
      ctx.fillStyle = e.color
      ctx.shadowColor = e.color; ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(e.x, e.y + e.r)
      ctx.lineTo(e.x - e.r, e.y - e.r * 0.7)
      ctx.lineTo(e.x + e.r, e.y - e.r * 0.7)
      ctx.closePath()
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // --- 标注 ---
    const behaviorLabels: Record<string, string> = {
      flock: '群体鸟群 · 分离+对齐+凝聚',
      evade: '弹幕回避 · 感知危险方向',
      guard: '护卫编队 · 环绕队长',
      ambush: '伏击突袭 · 待机→冲刺'
    }
    ctx.font = '10px ui-monospace, Consolas, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(`${bt.toUpperCase()} // ${behaviorLabels[bt] ?? bt}`, 8, 16)
  }

  // ==================== 主循环 ====================

  function start() {
    stop()
    t = 0
    cTrail = []
    resetEnemyPreview()
    resetEnemyWeaponPreview()
    resetEnemyPathPreview()
    resetBehaviorPreview()
    resetWeaponPreview()
    resetSkillPreview()
    const step = () => {
      const ctx = canvasRef.value?.getContext('2d')
      if (!ctx) return
      t++
      if (tab.value === 'character') drawCharacterPreview(ctx)
      else if (tab.value === 'enemy') drawEnemyPreview(ctx)
      else if (tab.value === 'enemyWeapon') drawEnemyWeaponPreview(ctx)
      else if (tab.value === 'enemyPath') drawEnemyPathPreview(ctx)
      else if (tab.value === 'enemyBehavior') drawEnemyBehaviorPreview(ctx)
      else if (tab.value === 'weapon') drawWeaponPreview(ctx)
      else if (sources.selectedSkill.value === 'emp') drawEmpSkillPreview(ctx)
      else if (sources.selectedSkill.value === 'gemini') drawGeminiSkillPreview(ctx)
      else drawSkillPreview(ctx)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  // 切换敌人 / 敌人武器时重置预览循环
  watch(selectedEnemy, () => {
    t = 0
    resetEnemyPreview()
  })
  watch(selectedEnemyWeapon, () => {
    t = 0
    resetEnemyWeaponPreview()
  })
  watch(selectedEnemyPath, () => {
    t = 0
    resetEnemyPathPreview()
  })
  watch(selectedEnemyBehavior, () => {
    t = 0
    resetBehaviorPreview()
  })
  watch(selectedCharacter, () => {
    t = 0
    cTrail = []
  })

  // 切换页签 / 武器 / 技能时重启对应预览（canvas 随 v-if 重建，需等 nextTick）
  watch([tab, selectedWeapon, sources.selectedSkill], () => {
    nextTick(() => start())
  })

  return { start, stop }
}
