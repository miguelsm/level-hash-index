import _ from 'lodash'
import test from 'tape'
import level from 'levelup'
import memdown from 'memdown'
import HashIndex from '../src'
import genRandomString from '../src/utils/gen-random-string'
import strHash from '../src/utils/string-hash'

test('ensure the basics work', async t => {
  try {
    const db = level(memdown)
    const hindex = HashIndex(db)
    const expectedHashKey = strHash('hello') + '0'

    let val

    try {
      val = await hindex.get(expectedHashKey)
    } catch (e) {
      t.equal(e && e.type, 'NotFoundError')
      t.notOk(val)
    }

    const results = []
    results.push(await hindex.putAndWrite('hello'))
    results.push(await hindex.get(expectedHashKey))
    results.push(await hindex.getHash('hello'))
    t.equal(results[0], expectedHashKey)
    t.equal(results[1], 'hello')
    t.equal(results[2], expectedHashKey)
    t.end()
  } catch (e) {
    t.end(e)
  }
})

test('ensure re-putting the same value before write yields the same hash', async t => {
  try {
    const hindex = HashIndex(level(memdown))
    const nPuts = 100
    const results = await Promise.all(
      _.range(0, nPuts).map(() => hindex.put('hello'))
    )
    t.deepEqual(
      _.unique(_.pluck(results, 'isNew')),
      [true],
      "all should be considered new until it's persisted to the db"
    )
    const hashes = _.pluck(results, 'hash')
    t.ok(_.every(hashes, _.isString), 'assert all hashes are string')
    t.equal(1, _.unique(hashes).length, 'assert only one hash')
    t.end()
  } catch (e) {
    t.end(e)
  }
})

function hashingThatAlwaysCollides () {
  return 'notahash'
}

function assertCollisionsExistAndAreHandled (t, vals, hashes) {
  t.ok(_.every(hashes, _.isString), 'assert all hashes are string')
  t.equal(hashes.length, _.unique(hashes).length, 'assert no collisions')
  t.equal(
    1,
    _.unique(
      hashes.map((hash, i) => {
        const val_hash = hashingThatAlwaysCollides(vals[i])
        return hash.substring(0, val_hash.length)
      })
    ).length,
    'assert they actually did collide'
  )
  t.equal(
    vals.length - 1,
    _.max(
      hashes.map((hash, i) => {
        const val_hash = hashingThatAlwaysCollides(vals[i])
        return parseInt(hash.substring(val_hash.length), 36)
      })
    ),
    'assert they actually did collide'
  )
}

test('handle hash collisions that are persisted', async t => {
  try {
    const hindex = HashIndex(level(memdown), {
      hashFn: hashingThatAlwaysCollides
    })
    const vals = _.unique(_.map(_.range(0, 100), genRandomString))
    const hashes = []
    for (const val of vals) {
      hashes.push(await hindex.putAndWrite(val))
    }
    assertCollisionsExistAndAreHandled(t, vals, hashes)
    t.end()
  } catch (e) {
    t.end(e)
  }
})

test('handle hash collisions that are not yet persisted', async t => {
  try {
    const hindex = HashIndex(level(memdown), {
      hashFn: hashingThatAlwaysCollides
    })
    const vals = _.unique(_.map(_.range(0, 100), genRandomString))
    const results = []
    for (const val of vals) {
      results.push(await hindex.put(val))
    }
    const hashes = _.pluck(results, 'hash')
    t.ok(_.every(_.pluck(results, 'isNew')), 'assert all are new hashes')
    assertCollisionsExistAndAreHandled(t, vals, hashes)
    t.end()
  } catch (e) {
    t.end(e)
  }
})

test('the cache should be honest on when the hash is actually persisted in the db', async t => {
  try {
    const hindex = HashIndex(level(memdown))
    let hash
    try {
      hash = await hindex.getHash('hello')
    } catch (e) {
      t.equal(e && e.type, 'NotFoundError', "shouldn't be hashed yet")
      t.notOk(hash)
    }
    const results = [
      await hindex.put('hello'),
      await hindex.put('hello'),
      await hindex.putAndWrite('hello'),
      await hindex.put('hello'),
      await hindex.getHash('hello')
    ]
    t.equal(
      results[0].isNew,
      true,
      "still should be new b/c it hasn't yet been written"
    )
    t.equal(
      results[1].isNew,
      true,
      "still should be new b/c it hasn't yet been written"
    )
    t.equal(_.isString(results[2]), true)
    t.notOk(results[3].isNew)
    t.equal(results[4], results[2])
    t.end()
  } catch (e) {
    t.end(e)
  }
})
