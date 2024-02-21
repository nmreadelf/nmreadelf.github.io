import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import DATA from '../dist/posts.json' assert { type: 'json' };

import 'dotenv/config'

export async function main() {
    const data = DATA
    data.items.push({ slug: 'page-about' })
    const db = new Kysely({ dialect: new SqliteDialect({ database: new Database(process.env.DB_PATH)})})
    const result = await db.insertInto('reaction').values(DATA.items.map((item) => ({
        name: item.slug, emoji_1: 0, emoji_2: 0, emoji_3: 0, emoji_4: 0, emoji_5: 0, emoji_6: 0, emoji_7: 0, emoji_8: 0
    })))
        .onConflict((oc) => oc.column('name').doNothing()).execute()
    console.log(result)
}

main().then(() => { })
