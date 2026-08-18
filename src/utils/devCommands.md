# 调试命令（cheat）

游戏页面打开浏览器控制台（F12），输入命令即可使用。页面加载后输入 `cheat.help()` 可随时查看帮助。

## 命令一览

| 命令 | 说明 | 示例 |
| ---- | ---- | ---- |
| `cheat.give(物品, 数量?)` | 获得物品，数量默认 1 | `cheat.give('AH-01')` |
| `cheat.crystal(数量)` | 增加水晶，传负数扣减 | `cheat.crystal(5000)` |
| `cheat.allWeapons()` | 一次发放全部武器各 1 件 | `cheat.allWeapons()` |
| `cheat.allItems(数量?)` | 一次发放全部物品，数量默认 1 | `cheat.allItems()` |
| `cheat.list()` | 表格列出全部物品 | `cheat.list()` |
| `cheat.help()` | 显示帮助 | `cheat.help()` |

## 物品的三种填法

`cheat.give()` 的第一个参数支持以下任意一种：

1. **物品 id**：如 `'wpn-ramhammer'`、`'energy-cell'`
2. **武器编号**：如 `'AH-01'`、`'AH-02'`、`'AH-03'`
3. **中文名**：如 `'伏尔甘'`、`'水晶'`

```js
cheat.give('AH-01')        // 伏尔甘 ×1
cheat.give('妙尔尼尔')      // 妙尔尼尔 ×1
cheat.give('energy-cell', 99)  // 能量电池 ×99
```

## 当前武器速查

| 武器 | 编号 | 物品 id | 占格 |
| ---- | ---- | ------- | ---- |
| 伏尔甘（动能步枪） | `AH-01` | `wpn-ramhammer` | 2×4 |
| 妙尔尼尔（反器材步枪） | `AH-02` | `wpn-mountainshear` | 1×5 |
| 塔罗斯（大口径手枪） | `AH-03` | `wpn-sledgefist` | 1×2 |
| 薇丝珀（电磁手枪） | `LW-01` | `wpn-vesper` | 1×2 |
| 奥罗拉（电磁突击步枪） | `LW-02` | `wpn-aurora` | 2×4 |
| 赫利俄斯（重型磁轨枪） | `LW-03` | `wpn-helios` | 1×5 |
| 新人手枪 | `WPN-01` | `wpn-rookie` | 2×1 |

## 注意事项

- 背包满了会提示放入失败或只放入部分数量
- 物品变动会自动存档到 localStorage，刷新页面后仍在
- 想重置背包：控制台执行 `localStorage.clear()` 后刷新页面
