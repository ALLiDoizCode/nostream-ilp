import chai from 'chai'
import sinonChai from 'sinon-chai'
import { vi } from 'vitest'

chai.use(sinonChai)

// Mock database client for BTP-NIPs tests
// This prevents tests from trying to connect to a real PostgreSQL database
vi.mock('../src/database/client', () => {
  const events = new Map<string, any>()

  const applyFilters = (filters: any) => {
    let results = Array.from(events.values())

    // Apply whereIn filters
    if (filters.pubkey && filters.pubkey.length > 0) {
      results = results.filter(e => filters.pubkey.includes(e.pubkey))
    }
    if (filters.kind && filters.kind.length > 0) {
      results = results.filter(e => filters.kind.includes(e.kind))
    }

    // Apply where conditions
    if (filters.conditions) {
      for (const cond of filters.conditions) {
        results = results.filter(e => {
          const val = e[cond.col]
          if (cond.operator === '<') return val !== null && val !== undefined && val < cond.value
          if (cond.operator === '>') return val !== null && val !== undefined && val > cond.value
          if (cond.operator === '>=') return val !== null && val !== undefined && val >= cond.value
          if (cond.operator === '<=') return val !== null && val !== undefined && val <= cond.value
          if (cond.operator === '=') return val === cond.value
          return true
        })
      }
    }

    return results
  }

  const createQueryChain = (filters: any = {}) => {
    const chain: any = {
      where: (col: any, op?: any, val?: any) => {
        if (typeof col === 'object') {
          // where({ id: '123' })
          Object.entries(col).forEach(([k, v]) => {
            if (!filters.conditions) filters.conditions = []
            filters.conditions.push({ col: k, operator: '=', value: v })
          })
        } else {
          // where('col', '>=', value) or where('col', value)
          const operator = val === undefined ? '=' : op
          const value = val === undefined ? op : val
          if (!filters.conditions) filters.conditions = []
          filters.conditions.push({ col, operator, value })
        }
        return createQueryChain(filters)
      },
      whereIn: (col: string, vals: any[]) => {
        filters[col] = vals
        return createQueryChain(filters)
      },
      update: async (data: any) => {
        // Apply filters to find matching events and update them
        const results = applyFilters(filters)
        results.forEach((event: any) => {
          Object.assign(event, data)
          events.set(event.id, event)
        })
        return results.length
      },
      select: (...cols: string[]) => {
        filters.selectCols = cols
        return createQueryChain(filters)
      },
      delete: async () => {
        // Apply filters to find matching events and delete them
        const results = applyFilters(filters)
        results.forEach((event: any) => {
          events.delete(event.id)
        })
        return results.length
      },
      orderBy: (col: string, dir: string) => {
        filters.orderBy = { col, dir }
        return createQueryChain(filters)
      },
      limit: (n: number) => {
        filters.limit = n
        return createQueryChain(filters)
      },
      count: (col: string) => {
        filters.countCol = col
        return createQueryChain(filters)
      },
      first: async () => {
        const results = applyFilters(filters)

        if (filters.countCol) {
          // Return count result
          return { count: results.length.toString() }
        }

        // Return first matching row
        return results.length > 0 ? results[0] : null
      },
      then: async (resolve: any) => {
        let results = applyFilters(filters)

        // Sort if specified
        if (filters.orderBy) {
          const { col, dir } = filters.orderBy
          results.sort((a, b) => {
            if (dir === 'desc') return b[col] - a[col]
            return a[col] - b[col]
          })
        }

        // Apply limit
        if (filters.limit) {
          results = results.slice(0, filters.limit)
        }

        // Project select columns if specified
        if (filters.selectCols && filters.selectCols.length > 0) {
          results = results.map((row: any) => {
            const projected: any = {}
            filters.selectCols.forEach((col: string) => {
              projected[col] = row[col]
            })
            return projected
          })
        }

        resolve(results)
      },
    }

    return chain
  }

  const mockKnex = (_tableName: string) => ({
    insert: (data: any) => ({
      onConflict: () => ({
        ignore: async () => {
          // Initialize default values for database fields
          const record = {
            ...data,
            is_deleted: data.is_deleted ?? false,
            expires_at: data.expires_at ?? null,
          }
          events.set(data.id, record)
        },
      }),
    }),
    where: (col: any, op?: any, val?: any) => createQueryChain().where(col, op, val),
    whereIn: (col: string, vals: any[]) => createQueryChain().whereIn(col, vals),
    orderBy: (col: string, dir: string) => createQueryChain().orderBy(col, dir),
    delete: async () => {
      events.clear()
    },
  })

  return {
    getMasterDbClient: () => mockKnex,
    getReadReplicaDbClient: () => mockKnex,
  }
})
