/**
 * @description 从给定的对象数组中选择得分最高的前 K 个对象。
 * @param items 要选择的对象数组，每个对象必须具有 `score` 属性。
 * @param limit 要选择的对象数量上限。
 * @returns 得分最高的前 K 个对象组成的新数组。
 * @example
 * const items = [
 *   { id: 1, score: 10 },
 *   { id: 2, score: 30 },
 *   { id: 3, score: 20 }
 * ]
 * const top2 = selectTopK(items, 2)
 * console.log(top2) // 输出: [{ id: 2, score: 30 }, { id: 3, score: 20 }]
 */
export function selectTopK<T extends { score: number }>(items: T[], limit: number): T[] {
  return [...items].sort((left, right) => right.score - left.score).slice(0, limit)
}
