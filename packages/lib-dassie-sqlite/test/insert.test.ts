import { describe, test } from "vitest"

import minimal from "./schemas/minimal"
import { createTestDatabase } from "./utils/create-test-database"
import { dumpTable } from "./utils/dump-table"

describe("INSERT", () => {
  describe("with a minimal schema", () => {
    test("should insert a row using kysely", async ({ expect }) => {
      const database = createTestDatabase(minimal)

      await database.kysely
        .insertInto("users")
        .values({
          id: 4n,
          name: "Disha",
          age: 91n,
        })
        .execute()

      expect(dumpTable(database, "users")).toMatchInlineSnapshot(`
        [
          {
            "age": 42n,
            "id": 1n,
            "name": "Anzhela",
          },
          {
            "age": 21n,
            "id": 2n,
            "name": "Borna",
          },
          {
            "age": 42n,
            "id": 3n,
            "name": "Caelius",
          },
          {
            "age": 91n,
            "id": 4n,
            "name": "Disha",
          },
        ]
      `)
    })

    test("should insert a row using shorthand", ({ expect }) => {
      const database = createTestDatabase(minimal)

      database.tables.users.insertOne({
        id: 4n,
        name: "Disha",
        age: 91n,
      })

      expect(dumpTable(database, "users")).toMatchInlineSnapshot(`
        [
          {
            "age": 42n,
            "id": 1n,
            "name": "Anzhela",
          },
          {
            "age": 21n,
            "id": 2n,
            "name": "Borna",
          },
          {
            "age": 42n,
            "id": 3n,
            "name": "Caelius",
          },
          {
            "age": 91n,
            "id": 4n,
            "name": "Disha",
          },
        ]
      `)
    })

    test("should insert multiple rows using shorthand", ({ expect }) => {
      const database = createTestDatabase(minimal)

      database.tables.users.insertMany([
        {
          id: 4n,
          name: "Disha",
          age: 91n,
        },
        {
          id: 5n,
          name: "Elias",
          age: 42n,
        },
      ])

      expect(dumpTable(database, "users")).toMatchInlineSnapshot(`
        [
          {
            "age": 42n,
            "id": 1n,
            "name": "Anzhela",
          },
          {
            "age": 21n,
            "id": 2n,
            "name": "Borna",
          },
          {
            "age": 42n,
            "id": 3n,
            "name": "Caelius",
          },
          {
            "age": 91n,
            "id": 4n,
            "name": "Disha",
          },
          {
            "age": 42n,
            "id": 5n,
            "name": "Elias",
          },
        ]
      `)
    })
  })
})
