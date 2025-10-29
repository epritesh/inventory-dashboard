import axios from 'axios'
import { ZohoClient } from './zohoClient'

jest.mock('axios')

describe('ZohoClient', () => {
  const mockedAxios = axios as unknown as jest.Mocked<typeof axios>

  function setupAxiosMocks() {
    // Mock token endpoint response
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: { access_token: 'token-123', expires_in: 3600 }
    }) as any

    const instance: any = {
      get: jest.fn().mockResolvedValue({ data: { items: [{ name: 'Item A', available_stock: 0 }] } })
    }
    ;(axios.create as unknown as jest.Mock).mockReturnValue(instance)
    return { instance }
  }

  beforeEach(() => {
    jest.resetAllMocks()
    ;(axios.create as unknown as jest.Mock) = jest.fn()
    // Ensure token cache is cleared between tests to avoid cross-test pollution
    ;(ZohoClient as any).resetTokenCacheForTests?.()
  })

  it('mints token via refresh_token and lists items', async () => {
    const { instance } = setupAxiosMocks()

    const client = new ZohoClient({
      service: 'books',
      dc: 'us',
      orgId: '123456789',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken'
    })

    const res = await client.listItems({ page: 1, per_page: 2 })
    expect(res).toEqual({ items: [{ name: 'Item A', available_stock: 0 }] })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringMatching(/oauth\/v2\/token/),
      expect.any(URLSearchParams)
    )
    expect(instance.get).toHaveBeenCalledWith('/items', expect.any(Object))
  })

  it('caches access token for subsequent calls', async () => {
    const { instance } = setupAxiosMocks()

    const client = new ZohoClient({
      service: 'books',
      dc: 'us',
      orgId: '123456789',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken',
      cacheTtlSeconds: 3600
    })

    await client.listItems({})
    await client.listItems({})
    // token mint should be called only once
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
    expect(instance.get).toHaveBeenCalledTimes(2)
  })
})
