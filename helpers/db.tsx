import {type GeneratedAlways, Kysely, CamelCasePlugin} from 'kysely'
import {PostgresJSDialect} from 'kysely-postgres-js'
import {DB} from './schema'
import postgres from 'postgres'
import { resolveDbPoolConfig } from './runtimeTuningConfig'

export const dbPoolConfig = resolveDbPoolConfig()

export const db = new Kysely<DB>({
plugins: [new CamelCasePlugin({underscoreBetweenUppercaseLetters: true})],
dialect: new PostgresJSDialect({
postgres: postgres(process.env.FLOOT_DATABASE_URL, {
prepare: false,
idle_timeout: dbPoolConfig.idleTimeoutSeconds,
max: dbPoolConfig.max,
}),
}),
})
