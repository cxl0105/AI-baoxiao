// 数字 / 货币工具
// 提炼自 Expensify 开源库 expensify-common（lib/Num.jsx，MIT License），
// 只保留通用、无后端依赖的部分，并改写为纯 TypeScript。

/** 把科学计数法数字转成普通字符串（如 1.886e+21 → "1886000000000000000000"） */
export function notExponential(num: number): string {
  const numStr = String(num)
  if (!numStr.includes('e')) return numStr
  const numArr = numStr.split(/e\+/)
  let exponent = parseInt(numArr[1], 10)
  let value = parseFloat(numArr[0])
  exponent -= 20
  value *= 10 ** 20
  let out = String(value)
  while (exponent-- > 0) out += '0'
  return out
}

/**
 * 数字格式化（千分位 + 小数位），类似 PHP 的 number_format
 * @param num          数字
 * @param decimals     小数位（默认 2）
 * @param decimalSep   小数分隔符（默认 '.'）
 * @param thousandsSep 千分位分隔符（默认 ','）
 */
export function numberFormat(
  num: number,
  decimals = 2,
  decimalSep = '.',
  thousandsSep = ','
): string {
  const multiplier = 10 ** decimals
  const rounded = Math.round((num + Number.EPSILON) * multiplier) / multiplier
  const sign = rounded < 0 ? '-' : ''
  const abs = Math.abs(rounded)
  const [intPart, fracRaw = ''] = notExponential(abs).split('.')
  let frac = fracRaw
  while (frac.length < decimals) frac += '0'
  let int = intPart
  if (thousandsSep !== '' && int.length > 3) {
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep)
  }
  const dec = decimals <= 0 ? '' : decimalSep + frac.slice(0, decimals)
  return `${sign}${int}${dec}`
}

/** 金额格式化：¥1,234.56 */
export function formatMoney(amount: number, symbol = '¥', decimals = 2): string {
  if (!isFiniteNumber(amount)) return `${symbol}0.${'0'.repeat(decimals)}`
  return `${symbol}${numberFormat(amount, decimals)}`
}

/** 截断到指定精度（四舍五入） */
export function toPrecision(number: number, decimals: number): number {
  const numeral = 10 ** decimals
  return Math.round(number * numeral) / numeral
}

/** 是否为有限且非 NaN 的数字 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value)
}

/** 是否在 [a, b] 区间内（含边界） */
export function isNumberBetween(number: number, a: number, b: number): boolean {
  return number >= Math.min(a, b) && number <= Math.max(a, b)
}

/** 货币展示应保留的小数位（整数汇率 2 位；一位小数 3 位；其余 4 位） */
export function getDisplayDecimals(rate: number): number {
  if (rate % 1 === 0) return 2
  if ((rate * 10) % 1 === 0) return 3
  return 4
}

/** 由含税总额 + 税率百分比（如 13 表示 13%）算税额 */
export function taxAmountFromTotal(total: number, percentage: number): number {
  const rate = percentage / 100
  return total - total / (1 + rate)
}
