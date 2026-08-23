const MOEGIRLPEDIA_API_URL = 'https://mzh.moegirl.org.cn/api.php'
const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 8
const MAX_PAGE_CHARS = 12_000

export type MoeGirlpediaCredentials = {
  username: string
  botPassword: string
}

export type MoeGirlpediaSearchItem = {
  title: string
  snippet: string
  pageId: number | null
  url: string
}

export type MoeGirlpediaPage = {
  title: string
  pageId: number | null
  revisionId: number | null
  content: string
  url: string
}

type JsonRecord = Record<string, unknown>

/**
 * @description 直接调用萌娘百科 MediaWiki API，并在同一个实例中维护登录会话。
 */
export class MoeGirlpediaApiClient {
  private readonly cookies = new Map<string, string>()
  private loginPromise: Promise<void> | null = null
  private currentUser: string | null = null

  /**
   * @description 创建使用指定 Bot Password 的萌娘百科 API 客户端。
   * @param credentials 萌娘百科登录凭据。
   */
  constructor(private readonly credentials: MoeGirlpediaCredentials) {}

  /**
   * @description 登录萌娘百科并读取当前用户信息，用于验证 Bot Password 是否可用。
   * @param signal 用于取消网络请求的信号。
   * @returns 当前登录用户名。
   */
  async testConnection(signal?: AbortSignal): Promise<string> {
    const response = await this.request(
      { action: 'query', meta: 'userinfo', uiprop: 'name' },
      signal
    )
    const userInfo = asRecord(asRecord(response.query).userinfo)
    const username = asString(userInfo.name) || this.currentUser || this.credentials.username.trim()
    await this.request(
      {
        action: 'query',
        generator: 'search',
        gsrsearch: '鸣潮',
        gsrlimit: 1,
        prop: 'info|extracts',
        exintro: '1',
        explaintext: '1',
        exchars: '300'
      },
      signal
    )
    return username
  }

  /**
   * @description 搜索萌娘百科页面。
   * @param query 页面标题或正文中的搜索词。
   * @param limit 返回结果数量，范围为 1 到 8。
   * @param signal 用于取消网络请求的信号。
   * @returns 规范化的搜索结果。
   */
  async search(
    query: string,
    limit = DEFAULT_SEARCH_LIMIT,
    signal?: AbortSignal
  ): Promise<MoeGirlpediaSearchItem[]> {
    const response = await this.request(
      {
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrlimit: limit,
        prop: 'info|extracts',
        exintro: '1',
        explaintext: '1',
        exchars: '300'
      },
      signal
    )
    const queryData = asRecord(response.query)
    const items = Array.isArray(queryData.pages) ? queryData.pages : []
    return items.flatMap((item) => {
      const record = asRecord(item)
      const title = asString(record.title)
      if (!title) return []
      return [
        {
          title,
          snippet: stripHtml(asString(record.extract)),
          pageId: asNullableNumber(record.pageid),
          url: this.pageUrl(title)
        }
      ]
    })
  }

  /**
   * @description 读取指定页面的主修订版本 wikitext。
   * @param title 页面标题。
   * @param signal 用于取消网络请求的信号。
   * @returns 页面标题、修订号和正文内容。
   */
  async readPage(title: string, signal?: AbortSignal): Promise<MoeGirlpediaPage> {
    const response = await this.request(
      { action: 'query', prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', titles: title },
      signal
    )
    const queryData = asRecord(response.query)
    const pages = Array.isArray(queryData.pages) ? queryData.pages : []
    const page = asRecord(pages[0])
    const resolvedTitle = asString(page.title) || title
    if (page.missing === true) throw new Error('MoeGirlpedia page not found: ' + title)
    const revisions = Array.isArray(page.revisions) ? page.revisions : []
    const revision = asRecord(revisions[0])
    const slots = asRecord(revision.slots)
    const mainSlot = asRecord(slots.main)
    const content = asString(mainSlot.content)
    if (!content) throw new Error('MoeGirlpedia page has no readable content: ' + resolvedTitle)
    return {
      title: resolvedTitle,
      pageId: asNullableNumber(page.pageid),
      revisionId: asNullableNumber(revision.revid),
      content,
      url: this.pageUrl(resolvedTitle)
    }
  }

  /**
   * @description 发送一次 MediaWiki POST 请求，必要时先建立 Bot Password 会话。
   * @param parameters MediaWiki action 参数。
   * @param signal 用于取消网络请求的信号。
   * @returns 未加工的 JSON 响应对象。
   * @remarks 萌娘百科当前会拒绝未登录的 API 请求，因此工具启用时必须配置 Bot Password。
   */
  private async request(
    parameters: Record<string, string | number>,
    signal?: AbortSignal
  ): Promise<JsonRecord> {
    await this.ensureLoggedIn(signal)
    const body = new URLSearchParams({
      action: String(parameters.action),
      format: 'json',
      formatversion: '2'
    })
    if (this.currentUser) body.set('assertuser', this.currentUser)
    Object.entries(parameters).forEach(([key, value]) => body.set(key, String(value)))
    const response = await fetch(MOEGIRLPEDIA_API_URL, {
      method: 'POST',
      headers: this.headers(),
      body,
      signal
    })
    await this.storeCookies(response)
    const payload = await readJson(response)
    const apiError = asRecord(payload.error)
    if (Object.keys(apiError).length > 0)
      throw new Error(
        'MoeGirlpedia API error: ' + (asString(apiError.info) || asString(apiError.code))
      )
    return payload
  }

  /**
   * @description 使用 Bot Password 登录萌娘百科，并缓存登录会话。
   * @param signal 用于取消网络请求的信号。
   */
  private async ensureLoggedIn(signal?: AbortSignal): Promise<void> {
    if (this.loginPromise) return this.loginPromise
    const username = this.credentials.username.trim()
    const password = this.credentials.botPassword.trim()
    if (!username || !password)
      throw new Error('Both the Moegirlpedia username and Bot Password are required.')
    this.loginPromise = this.login(username, password, signal).catch((error) => {
      this.loginPromise = null
      throw error
    })
    return this.loginPromise
  }

  /**
   * @description 执行 MediaWiki 的 login token 和 login 两步流程。
   * @param username Bot Password 对应的用户名。
   * @param password Bot Password。
   * @param signal 用于取消网络请求的信号。
   */
  private async login(username: string, password: string, signal?: AbortSignal): Promise<void> {
    const tokenPayload = await this.requestWithoutLogin(
      { action: 'query', meta: 'tokens', type: 'login' },
      signal
    )
    const token = asString(asRecord(asRecord(tokenPayload.query).tokens).logintoken)
    if (!token) throw new Error('MoeGirlpedia login token was not returned.')
    const loginPayload = await this.requestWithoutLogin(
      { action: 'login', lgname: username, lgpassword: password, lgtoken: token },
      signal
    )
    const login = asRecord(loginPayload.login)
    const result = asString(login.result)
    if (result !== 'Success') {
      const reason = asString(login.reason)
      throw new Error(
        'MoeGirlpedia login failed: ' +
          (result || 'unknown result') +
          (reason ? ' (' + reason + ')' : '')
      )
    }
    this.currentUser = username.split('@')[0]
  }

  /**
   * @description 发送不触发登录的请求，用于获取登录 token。
   * @param parameters MediaWiki action 参数。
   * @param signal 用于取消网络请求的信号。
   * @returns 未加工的 JSON 响应对象。
   */
  private async requestWithoutLogin(
    parameters: Record<string, string>,
    signal?: AbortSignal
  ): Promise<JsonRecord> {
    const body = new URLSearchParams({ ...parameters, format: 'json', formatversion: '2' })
    const response = await fetch(MOEGIRLPEDIA_API_URL, {
      method: 'POST',
      headers: this.headers(),
      body,
      signal
    })
    await this.storeCookies(response)
    const payload = await readJson(response)
    const apiError = asRecord(payload.error)
    if (Object.keys(apiError).length > 0)
      throw new Error(
        'MoeGirlpedia API error: ' + (asString(apiError.info) || asString(apiError.code))
      )
    return payload
  }

  /**
   * @description 构造符合萌娘百科要求的请求头。
   * @returns API 请求头。
   */
  private headers(): Record<string, string> {
    const cookie = [...this.cookies.entries()].map(([name, value]) => name + '=' + value).join('; ')
    return {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'WuWaChat/0.2 (MediaWiki API client)',
      'Api-User-Agent': 'WuWaChat/0.2 (MediaWiki API client)',
      Origin: 'https://mzh.moegirl.org.cn',
      ...(cookie ? { Cookie: cookie } : {})
    }
  }

  /**
   * @description 保存响应中的会话 cookie，供后续登录请求复用。
   * @param response MediaWiki HTTP 响应。
   */
  private async storeCookies(response: Response): Promise<void> {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] }
    const setCookies =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : headers.get('set-cookie')?.split(/,(?=[^;,]+=)/u) || []
    setCookies.forEach((cookie) => {
      const match = cookie.match(/^([^=;]+)=([^;]*)/u)
      if (match) this.cookies.set(match[1], match[2])
    })
  }

  /**
   * @description 返回页面的公开 URL。
   * @param title 页面标题。
   * @returns 页面 URL。
   */
  private pageUrl(title: string): string {
    return 'https://mzh.moegirl.org.cn/' + encodeURIComponent(title).replace(/%2F/gu, '/')
  }
}
/**
 * @description 将未知值转换为结构化对象。
 * @param value 待转换的未知值。
 * @returns 对象值，否则返回空对象。
 */
function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

/**
 * @description 从未知值中读取字符串。
 * @param value 待转换的未知值。
 * @returns 字符串值，否则返回空字符串。
 */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * @description 从未知值中读取可空数字。
 * @param value 待转换的未知值。
 * @returns 有限数字，否则返回 null。
 */
function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * @description 读取 JSON 响应并转换 HTTP 或 JSON 格式错误。
 * @param response HTTP 响应。
 * @returns 结构化 JSON 对象。
 */
async function readJson(response: Response): Promise<JsonRecord> {
  const text = await response.text()
  if (!response.ok)
    throw new Error('MoeGirlpedia HTTP error: ' + response.status + ' ' + response.statusText)
  try {
    return asRecord(JSON.parse(text))
  } catch (error) {
    throw new Error(
      'MoeGirlpedia returned invalid JSON: ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

/**
 * @description 将搜索摘要中的 HTML 转换为纯文本。
 * @param value MediaWiki 返回的 HTML 摘要。
 * @returns 可安全交给模型阅读的纯文本。
 */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .trim()
}

export { DEFAULT_SEARCH_LIMIT, MAX_PAGE_CHARS, MAX_SEARCH_LIMIT }
